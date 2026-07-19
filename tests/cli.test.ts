import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
const MARKETPLACE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'cc-marketplace',
  'MARKETPLACE.yaml',
);

let temporaryRoot: string;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-cli-'));
});

afterAll(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('compile command', () => {
  test('materializes every publication and summarizes nonfatal diagnostics', () => {
    const outDir = join(temporaryRoot, 'all-publications');

    const result = runCli('compile', MARKETPLACE, '--out', outDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^\[claude\] wrote \d+ files\n\[codex\] wrote \d+ files\n/);
    expect(result.stdout).toContain(
      'note [codex/librarian] inferred-artifact-projection: Agent "vault-reader" inferred',
    );
    expect(existsSync(join(outDir, 'claude', '.claude-plugin', 'marketplace.json'))).toBe(true);
    expect(existsSync(join(outDir, 'codex', '.agents', 'plugins', 'marketplace.json'))).toBe(true);
    expect(existsSync(join(outDir, 'claude', 'packages', 'spec-flow', 'hooks', 'hooks.json'))).toBe(
      true,
    );
    expect(
      existsSync(
        join(outDir, 'codex', 'packages', 'spec-flow', 'skills', 'draft', 'assets', 'logo.txt'),
      ),
    ).toBe(true);
  });

  test('materializes only repeatably selected publications', () => {
    const outDir = join(temporaryRoot, 'selected-publication');

    const result = runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'codex');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\[codex\] wrote \d+ files\n/);
    expect(result.stdout).not.toContain('[claude]');
    expect(existsSync(join(outDir, 'codex', '.agents', 'plugins', 'marketplace.json'))).toBe(true);
    expect(existsSync(join(outDir, 'claude'))).toBe(false);
  });

  test('produces deterministic summaries and output across rebuilds', () => {
    const outDir = join(temporaryRoot, 'deterministic-rebuild');

    const first = runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude');
    const firstMarketplace = readFileSync(
      join(outDir, 'claude', '.claude-plugin', 'marketplace.json'),
    );
    const second = runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude');
    const secondMarketplace = readFileSync(
      join(outDir, 'claude', '.claude-plugin', 'marketplace.json'),
    );

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(secondMarketplace).toEqual(firstMarketplace);
  });

  test('rejects unknown publications before changing existing output', () => {
    const outDir = join(temporaryRoot, 'unknown-publication');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'sentinel.txt'), 'keep me\n');

    const result = runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'missing');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('unknown publication: missing');
    expect(readFileSync(join(outDir, 'sentinel.txt'), 'utf8')).toBe('keep me\n');
  });

  test('rejects duplicate publication selections', () => {
    const outDir = join(temporaryRoot, 'duplicate-publication');

    const result = runCli(
      'compile',
      MARKETPLACE,
      '--out',
      outDir,
      '--publication',
      'codex',
      '--publication',
      'codex',
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('duplicate publication: codex');
    expect(existsSync(outDir)).toBe(false);
  });
});

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
