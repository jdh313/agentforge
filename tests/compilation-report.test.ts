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
// Bullets 1 and 2 were amended after the user signed off on grouping by
// *disposition* ("what became of it") rather than severity: severity does
// not track loss (`declared-loss` is a note and is a real loss;
// `translated-construct` is also a note and is not one), so a severity-led
// report would file a confirmed loss beside a non-loss. `src/report.ts`
// derives `Disposition` from each diagnostic's code via `dispositionOf` —
// never stored on the diagnostic — and nests JSON under `targets` rather
// than a top-level `packages` map. Bullets 3 and 4 are unchanged.

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

// Disposition order runs confirmed-loss-first, unknown-last — a scale, not an
// alphabet — so it is asserted as an ORDERED array, not just a set of pairs.
const EXPECTED_DISPOSITION_ORDER = [
  'lost-undeclared',
  'carried-form-changed',
  'carried-unenforced',
  'not-established',
] as const;
const EXPECTED_COUNTS_BY_DISPOSITION = {
  'lost-undeclared': 2,
  'carried-form-changed': 5,
  'carried-unenforced': 3,
  'not-established': 1,
};
const EXPECTED_DISPOSITION_BY_CODE: Record<string, string> = {
  'inferred-artifact-projection': 'carried-unenforced',
  'translated-construct': 'carried-form-changed',
  'translated-hook-handler-args': 'carried-form-changed',
  'unsupported-hook-event': 'lost-undeclared',
  'unclassified-hook-event': 'not-established',
};
// Human-readable labels the markdown renderer must use next to each bullet.
const DISPOSITION_LABEL: Record<string, string> = {
  'lost-undeclared': 'lost, undeclared',
  'carried-form-changed': 'carried, form changed',
  'carried-unenforced': 'carried, unenforced',
  'not-established': 'not established',
};

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
  test('writes a JSON report carrying every diagnostic with retainedSource intact, plus counts by code, severity and disposition', () => {
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
    expect(report.counts.byDisposition).toEqual(EXPECTED_COUNTS_BY_DISPOSITION);

    // Disposition is a scale from confirmed loss to unknown, so its key order
    // is meaningful and must survive serialization rather than being sorted.
    expect(Object.keys(report.counts.byDisposition)).toEqual([...EXPECTED_DISPOSITION_ORDER]);

    // Target is the outer axis. Only codex reports today; claude is the source
    // dialect and passes source through, so it contributes nothing.
    expect(Object.keys(report.targets)).toEqual(['codex']);
    const codex = report.targets.codex;
    expect(codex.counts.byDisposition).toEqual(EXPECTED_COUNTS_BY_DISPOSITION);

    const packageIds = Object.keys(codex.packages).toSorted();
    expect(packageIds).toEqual(['guarded', 'notifier', 'triage']);

    let totalDiagnostics = 0;
    for (const [packageId, expectedCount] of Object.entries(EXPECTED_PACKAGE_DIAGNOSTIC_COUNTS)) {
      const pkg = codex.packages[packageId];
      expect(pkg.diagnostics).toHaveLength(expectedCount);
      totalDiagnostics += pkg.diagnostics.length;

      for (const diagnostic of pkg.diagnostics) {
        expect(typeof diagnostic.code).toBe('string');
        expect(['note', 'warning']).toContain(diagnostic.severity);
        // Disposition is derived from the code, and must not merely track
        // severity — `declared-loss` is a note that IS a loss, and
        // `translated-construct` is a note that is not one.
        expect(diagnostic.disposition).toBe(EXPECTED_DISPOSITION_BY_CODE[diagnostic.code]);
        expect(diagnostic.retainedSource).toBeDefined();
        expect(diagnostic.retainedSource.artifactType).toBe('hook');
        // Relative to the marketplace root, not an absolute machine-specific path.
        expect(diagnostic.retainedSource.sourcePath).toBe(`packages/${packageId}/hooks/hooks.json`);
        expect(diagnostic.retainedSource.sourcePath).not.toContain(HOOK_MARKETPLACE_ROOT);
      }
    }
    expect(totalDiagnostics).toBe(EXPECTED_TOTAL_DIAGNOSTICS);
  });

  test('writes a markdown report grouped by target, package and source file, led by a disposition table', () => {
    const outDir = join(temporaryRoot, 'md-report-out');
    const reportPath = join(temporaryRoot, 'md-report', 'report.md');

    const result = runCli('compile', HOOK_FIXTURE, '--out', outDir, '--report', reportPath);

    expect(result.exitCode).toBe(0);
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, 'utf8');

    // The document leads with a disposition table, not a severity one. The
    // first table header in the file is the assertion: severity grouping filed
    // a confirmed loss beside a non-loss, which is what disposition replaced.
    const tableIndex = content.indexOf('| Disposition | Count |');
    expect(tableIndex).toBeGreaterThan(-1);
    expect(content.indexOf('|')).toBe(tableIndex);
    for (const [key, count] of Object.entries(EXPECTED_COUNTS_BY_DISPOSITION)) {
      expect(content).toContain(`| ${DISPOSITION_LABEL[key]} | ${count} |`);
    }
    // Severity survives as a secondary count rather than being dropped.
    expect(content).toMatch(/by severity:.*note 6.*warning 5/);

    // Target is the outer grouping level, above every package section.
    const targetIndex = content.indexOf('## Target: codex');
    expect(targetIndex).toBeGreaterThan(tableIndex);

    const guardedIndex = content.indexOf('### codex / guarded');
    const notifierIndex = content.indexOf('### codex / notifier');
    const triageIndex = content.indexOf('### codex / triage');
    expect(guardedIndex).toBeGreaterThan(targetIndex);
    expect(notifierIndex).toBeGreaterThan(guardedIndex);
    expect(triageIndex).toBeGreaterThan(notifierIndex);

    // Source file is the innermost grouping level, so a reader can answer
    // "what did this file lose?" without reading the whole package section.
    const triageBody = content.slice(triageIndex);
    expect(triageBody).toContain('#### `packages/triage/hooks/hooks.json`');

    // Each diagnostic carries its disposition label, and triage's two
    // confirmed losses sort ahead of its unestablished one.
    const lostIndex = triageBody.indexOf(`**${DISPOSITION_LABEL['lost-undeclared']}**`);
    const unknownIndex = triageBody.indexOf(`**${DISPOSITION_LABEL['not-established']}**`);
    expect(lostIndex).toBeGreaterThan(-1);
    expect(unknownIndex).toBeGreaterThan(lostIndex);
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
