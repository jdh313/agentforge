import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Coverage for the compilation report companion contract (Fibery #31):
// `agentforge compile --report <path>` renders that compile's diagnostics to
// a file outside the -o publication tree, format inferred from extension.
// See .docs/2026-08-09-compilation-report-companion.md and CONTEXT.md's
// "compilation report" / "omission" glossary entries; L-007 is
// docs/limitations.md's "files the compiler does not carry are dropped with
// nothing reported" — the report's header must say it covers translation,
// not omission, so a reader does not mistake it for a complete account.
//
// `--report` does not exist yet, so every test below fails on "unknown
// option '--report'" — the flag is unimplemented, not misused.

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');

// Single-publication fixture (codex only) whose three packages emit a rich,
// deterministic diagnostic mix across every relevant code and severity —
// already relied on by tests/codex-hook-projection.test.ts.
const HOOK_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-hook-projection',
  'MARKETPLACE.yaml',
);
const HOOK_MARKETPLACE_ROOT = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-hook-projection',
);

// Diagnostics produced by compiling HOOK_FIXTURE today (verified directly
// against compileMarketplace before writing this file) — the report must
// carry all of them, just relativized and counted.
const EXPECTED_TOTAL_DIAGNOSTICS = 11;
const EXPECTED_COUNTS_BY_SEVERITY = { note: 6, warning: 5 };
const EXPECTED_COUNTS_BY_CODE = {
  'inferred-artifact-projection': 3,
  'translated-construct': 3,
  'translated-hook-handler-args': 2,
  'unsupported-hook-event': 2,
  'unclassified-hook-event': 1,
};
const EXPECTED_PACKAGE_DIAGNOSTIC_COUNTS = { guarded: 2, notifier: 4, triage: 5 };

let temporaryRoot: string;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-compilation-report-'));
});

afterAll(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('compile --report', () => {
  test('writes a JSON report carrying every diagnostic with retainedSource intact, plus counts by code and by severity', () => {
    const outDir = join(temporaryRoot, 'json-report-out');
    const reportPath = join(temporaryRoot, 'json-report', 'report.json');

    const result = runCli('compile', HOOK_FIXTURE, '--out', outDir, '--report', reportPath);

    expect(result.exitCode).toBe(0);
    expect(existsSync(reportPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));

    expect(report.schemaVersion).toBe(1);
    expect(report.marketplaceId).toBe('codex-hook-projection');
    expect(report.counts.bySeverity).toEqual(EXPECTED_COUNTS_BY_SEVERITY);
    expect(report.counts.byCode).toEqual(EXPECTED_COUNTS_BY_CODE);

    const packageIds = Object.keys(report.packages).toSorted();
    expect(packageIds).toEqual(['guarded', 'notifier', 'triage']);

    let totalDiagnostics = 0;
    for (const [packageId, expectedCount] of Object.entries(EXPECTED_PACKAGE_DIAGNOSTIC_COUNTS)) {
      const pkg = report.packages[packageId];
      expect(pkg.diagnostics).toHaveLength(expectedCount);
      totalDiagnostics += pkg.diagnostics.length;

      for (const diagnostic of pkg.diagnostics) {
        expect(typeof diagnostic.code).toBe('string');
        expect(['note', 'warning']).toContain(diagnostic.severity);
        expect(diagnostic.retainedSource).toBeDefined();
        expect(diagnostic.retainedSource.artifactType).toBe('hook');
        // Relative to the marketplace root, not an absolute machine-specific path.
        expect(diagnostic.retainedSource.sourcePath).toBe(`packages/${packageId}/hooks/hooks.json`);
        expect(diagnostic.retainedSource.sourcePath).not.toContain(HOOK_MARKETPLACE_ROOT);
      }
    }
    expect(totalDiagnostics).toBe(EXPECTED_TOTAL_DIAGNOSTICS);
  });

  test('writes a markdown report grouped by package then severity, led by a counts table', () => {
    const outDir = join(temporaryRoot, 'md-report-out');
    const reportPath = join(temporaryRoot, 'md-report', 'report.md');

    const result = runCli('compile', HOOK_FIXTURE, '--out', outDir, '--report', reportPath);

    expect(result.exitCode).toBe(0);
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, 'utf8');

    // A leading counts table: a markdown table mentioning each severity and
    // its count, before any per-package section.
    const tableIndex = content.indexOf('|');
    expect(tableIndex).toBeGreaterThan(-1);
    expect(content).toMatch(/\|.*note.*\|.*6.*\|/i);
    expect(content).toMatch(/\|.*warning.*\|.*5.*\|/i);

    const guardedIndex = content.indexOf('guarded');
    const notifierIndex = content.indexOf('notifier');
    const triageIndex = content.indexOf('triage');
    expect(guardedIndex).toBeGreaterThan(-1);
    expect(notifierIndex).toBeGreaterThan(-1);
    expect(triageIndex).toBeGreaterThan(-1);
    // Grouped by package: the counts table precedes every package section.
    expect(tableIndex).toBeLessThan(guardedIndex);
    expect(tableIndex).toBeLessThan(notifierIndex);
    expect(tableIndex).toBeLessThan(triageIndex);

    // Within the triage section (mixed note + warning), severity grouping
    // means every "warning" mention in that section precedes every "note"
    // mention that belongs to a different, already-passed package, or is
    // its own subheading — check triage's own warning and note subsections
    // both appear after the triage heading.
    const triageSection = content.slice(triageIndex);
    const nextPackageOffset = Math.min(
      ...[guardedIndex, notifierIndex]
        .filter((index) => index > triageIndex)
        .map((index) => index - triageIndex),
      triageSection.length,
    );
    const triageBody = triageSection.slice(0, nextPackageOffset);
    expect(triageBody).toMatch(/warning/i);
    expect(triageBody).toMatch(/note/i);
  });

  test('never writes the report anywhere under the -o publication tree', () => {
    const outDir = join(temporaryRoot, 'out-of-tree-out');
    const baseline = runCli('compile', HOOK_FIXTURE, '--out', outDir);
    expect(baseline.exitCode).toBe(0);
    const baselineFiles = listRelativeFiles(outDir);

    const outDirWithReport = join(temporaryRoot, 'out-of-tree-out-with-report');
    // --report points at a sibling location entirely outside outDirWithReport.
    const reportPath = join(temporaryRoot, 'out-of-tree-report', 'report.json');

    const result = runCli(
      'compile',
      HOOK_FIXTURE,
      '--out',
      outDirWithReport,
      '--report',
      reportPath,
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(reportPath)).toBe(true);

    // Adding --report must not change what gets published under -o: the
    // report is never an output, so the tree is byte-for-byte the same
    // whether or not a report was requested alongside it.
    expect(listRelativeFiles(outDirWithReport)).toEqual(baselineFiles);
    for (const relativePath of listRelativeFiles(outDirWithReport)) {
      expect(relativePath).not.toContain('report');
    }
  });

  test('both formats carry a header stating the report covers translation, not omission, citing L-007', () => {
    const jsonReportPath = join(temporaryRoot, 'header-report', 'report.json');
    const mdReportPath = join(temporaryRoot, 'header-report', 'report.md');

    const jsonResult = runCli(
      'compile',
      HOOK_FIXTURE,
      '--out',
      join(temporaryRoot, 'header-json-out'),
      '--report',
      jsonReportPath,
    );
    const mdResult = runCli(
      'compile',
      HOOK_FIXTURE,
      '--out',
      join(temporaryRoot, 'header-md-out'),
      '--report',
      mdReportPath,
    );

    expect(jsonResult.exitCode).toBe(0);
    expect(mdResult.exitCode).toBe(0);

    const jsonText = readFileSync(jsonReportPath, 'utf8');
    const mdText = readFileSync(mdReportPath, 'utf8');

    for (const text of [jsonText, mdText]) {
      expect(text).toContain('L-007');
      expect(text.toLowerCase()).toContain('translation');
      expect(text.toLowerCase()).toContain('omission');
    }
  });
});

function runCli(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', CLI, ...args],
    cwd: REPO_ROOT,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function listRelativeFiles(root: string, directory = root): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listRelativeFiles(root, path) : [path.slice(root.length + 1)];
    })
    .toSorted();
}
