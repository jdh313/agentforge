import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
const FIXTURE = join(import.meta.dir, 'fixtures', 'definitions', 'cc-marketplace');

let temporaryRoot: string;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-root-manifest-'));
});

afterAll(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('root-manifest publications', () => {
  test('writes a root copy whose plugin sources point into the compiled output', () => {
    const root = stageMarketplace('writes-root-copy', { rootManifest: true });

    const result = runCli('compile', join(root, 'MARKETPLACE.yaml'), '--out', join(root, 'out'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      '[claude] root manifest <root>/.claude-plugin/marketplace.json',
    );

    const rootSources = pluginSources(join(root, '.claude-plugin', 'marketplace.json'));
    expect(rootSources).toEqual([
      './out/claude/packages/commit',
      './out/claude/packages/craft',
      './out/claude/packages/librarian',
      './out/claude/packages/linear',
      './out/claude/packages/spec-flow',
    ]);

    // The nested copy is what a local-directory install resolves against, so it
    // must be untouched by the root copy existing.
    const nested = join(root, 'out', 'claude', '.claude-plugin', 'marketplace.json');
    expect(pluginSources(nested)).toEqual([
      './packages/commit',
      './packages/craft',
      './packages/librarian',
      './packages/linear',
      './packages/spec-flow',
    ]);

    // Everything but the sources is identical between the two copies.
    expect(withoutPluginSources(join(root, '.claude-plugin', 'marketplace.json'))).toEqual(
      withoutPluginSources(nested),
    );
  });

  test('rewrites the Codex plugin path, which nests under source.path', () => {
    const root = stageMarketplace('codex-root-copy', { rootManifest: true, publication: 'codex' });

    expect(
      runCli('compile', join(root, 'MARKETPLACE.yaml'), '--out', join(root, 'out')).exitCode,
    ).toBe(0);

    const document = JSON.parse(
      readFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'),
    ) as { plugins: { source: { path: string } }[] };
    expect(document.plugins.map(({ source }) => source.path)).toEqual([
      './out/codex/packages/commit',
      './out/codex/packages/craft',
      './out/codex/packages/librarian',
      './out/codex/packages/linear',
      './out/codex/packages/spec-flow',
    ]);
  });

  test('writes nothing when --out is outside the marketplace directory', () => {
    const root = stageMarketplace('out-outside', { rootManifest: true });
    const outside = join(temporaryRoot, 'out-outside-target');

    const result = runCli('compile', join(root, 'MARKETPLACE.yaml'), '--out', outside);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `publication "claude" declares root-manifest, which requires --out to be inside the marketplace directory ${root}; got ${outside}`,
    );
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(join(root, '.claude-plugin', 'marketplace.json'))).toBe(false);
  });

  test('check counts the root copy and reports drift in it', () => {
    const root = stageMarketplace('check-drift', { rootManifest: true });
    const out = join(root, 'out');
    expect(runCli('compile', join(root, 'MARKETPLACE.yaml'), '--out', out).exitCode).toBe(0);

    const clean = runCli('check', join(root, 'MARKETPLACE.yaml'), '--out', out);
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout).toContain('[claude] ok:');

    const rootManifest = join(root, '.claude-plugin', 'marketplace.json');

    // The root copy is counted among the publication's managed files, not
    // silently excluded from the tally.
    const plain = stageMarketplace('check-drift-plain', { rootManifest: false });
    expect(
      runCli('compile', join(plain, 'MARKETPLACE.yaml'), '--out', join(plain, 'out')).exitCode,
    ).toBe(0);
    const plainCheck = runCli(
      'check',
      join(plain, 'MARKETPLACE.yaml'),
      '--out',
      join(plain, 'out'),
    );
    expect(managedFileCount(clean.stdout)).toBe(managedFileCount(plainCheck.stdout) + 1);

    const drifted = JSON.parse(readFileSync(rootManifest, 'utf8')) as { name: string };
    drifted.name = 'hand-edited';
    writeFileSync(rootManifest, `${JSON.stringify(drifted, null, 2)}\n`);

    const dirty = runCli('check', join(root, 'MARKETPLACE.yaml'), '--out', out);
    expect(dirty.exitCode).toBe(1);
    expect(dirty.stderr).toContain(
      'error [claude] changed-output: <root>/.claude-plugin/marketplace.json: managed root manifest differs from the compilation plan',
    );

    rmSync(rootManifest);
    const missing = runCli('check', join(root, 'MARKETPLACE.yaml'), '--out', out);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain(
      'error [claude] missing-output: <root>/.claude-plugin/marketplace.json: managed root manifest is missing',
    );
  });

  test('writes no root copy when the flag is absent', () => {
    const root = stageMarketplace('flag-absent', { rootManifest: false });

    const result = runCli('compile', join(root, 'MARKETPLACE.yaml'), '--out', join(root, 'out'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('root manifest');
    expect(existsSync(join(root, '.claude-plugin', 'marketplace.json'))).toBe(false);
    expect(existsSync(join(root, '.agents', 'plugins', 'marketplace.json'))).toBe(false);
    expect(
      runCli('check', join(root, 'MARKETPLACE.yaml'), '--out', join(root, 'out')).exitCode,
    ).toBe(0);
  });

  test('lists the root manifest in the compilation report', () => {
    const root = stageMarketplace('report-listing', { rootManifest: true });
    const reportPath = join(root, 'report.json');

    expect(
      runCli(
        'compile',
        join(root, 'MARKETPLACE.yaml'),
        '--out',
        join(root, 'out'),
        '--report',
        reportPath,
      ).exitCode,
    ).toBe(0);

    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { rootManifests?: string[] };
    expect(report.rootManifests).toEqual(['<root>/.claude-plugin/marketplace.json']);
  });
});

// A copy of the committed fixture: the flag makes the compiler write into the
// marketplace directory itself, which must never be the checked-in tree.
function stageMarketplace(
  name: string,
  options: { rootManifest: boolean; publication?: 'claude' | 'codex' },
): string {
  const root = join(temporaryRoot, name);
  cpSync(FIXTURE, root, { recursive: true });
  if (!options.rootManifest) return root;

  const definitionPath = join(root, 'MARKETPLACE.yaml');
  const publication = options.publication ?? 'claude';
  const source = readFileSync(definitionPath, 'utf8');
  const anchor = `  - id: ${publication}\n`;
  if (!source.includes(anchor)) throw new Error(`no ${publication} publication in the fixture`);
  writeFileSync(definitionPath, source.replace(anchor, `${anchor}    root-manifest: true\n`));
  return root;
}

function managedFileCount(stdout: string): number {
  const match = /\[claude\] ok: (\d+) managed files/.exec(stdout);
  if (!match?.[1]) throw new Error(`no claude managed-file count in: ${stdout}`);
  return Number(match[1]);
}

function pluginSources(path: string): string[] {
  const document = JSON.parse(readFileSync(path, 'utf8')) as { plugins: { source: string }[] };
  return document.plugins.map(({ source }) => source);
}

function withoutPluginSources(path: string): unknown {
  const document = JSON.parse(readFileSync(path, 'utf8')) as {
    plugins: Record<string, unknown>[];
  };
  return {
    ...document,
    plugins: document.plugins.map(({ source: _source, ...rest }) => rest),
  };
}

function runCli(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', CLI, ...args],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
