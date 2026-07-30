import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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
const EXPECTED_MARKETPLACE = join(import.meta.dir, 'fixtures', 'expected', 'cc-marketplace');
const CC_MARKETPLACE_PROJECT = process.env.AGENTFORGE_CC_MARKETPLACE_PROJECT;

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
  test('matches the committed payload-fidelity trees byte-for-byte with normalized modes', () => {
    const outDir = join(temporaryRoot, 'payload-fidelity');

    const result = runCli('compile', MARKETPLACE, '--out', outDir);

    expect(result.exitCode).toBe(0);
    expect(
      snapshotOutputTree(outDir, process.platform === 'win32' ? expectedMode : undefined),
    ).toEqual(snapshotOutputTree(EXPECTED_MARKETPLACE, expectedMode));
    if (process.platform !== 'win32') {
      for (const target of ['claude', 'codex']) {
        expect(
          statSync(
            join(outDir, target, 'packages', 'spec-flow', 'skills', 'draft', 'scripts', 'check.ts'),
          ).mode & 0o777,
        ).toBe(0o755);
      }
      expect(
        statSync(
          join(
            outDir,
            'codex',
            'packages',
            'spec-flow',
            'skills',
            'draft',
            'agents',
            'openai.yaml',
          ),
        ).mode & 0o777,
      ).toBe(0o644);
    }
  });

  test('materializes the complete five-package acceptance interface', () => {
    const outDir = join(temporaryRoot, 'acceptance-interface');

    const result = runCli('compile', MARKETPLACE, '--out', outDir);

    expect(result.exitCode).toBe(0);
    expect(listRelativeFiles(outDir)).toEqual([
      'claude/.claude-plugin/marketplace.json',
      'claude/packages/commit/.claude-plugin/plugin.json',
      'claude/packages/commit/hooks/destructive-vcs-guard.sh',
      'claude/packages/commit/hooks/hooks.json',
      'claude/packages/commit/skills/commit/SKILL.md',
      'claude/packages/craft/.claude-plugin/plugin.json',
      'claude/packages/craft/skills/tdd/SKILL.md',
      'claude/packages/librarian/.claude-plugin/plugin.json',
      'claude/packages/librarian/agents/vault-reader.md',
      'claude/packages/librarian/skills/wiki-query/SKILL.md',
      'claude/packages/linear/.claude-plugin/plugin.json',
      'claude/packages/linear/skills/linear/SKILL.md',
      'claude/packages/spec-flow/.claude-plugin/plugin.json',
      'claude/packages/spec-flow/LICENSE.txt',
      'claude/packages/spec-flow/commands/spec-flow.md',
      'claude/packages/spec-flow/hooks/hooks.json',
      'claude/packages/spec-flow/native-hooks.json',
      'claude/packages/spec-flow/skills/draft/SKILL.md',
      'claude/packages/spec-flow/skills/draft/assets/logo.txt',
      'claude/packages/spec-flow/skills/draft/references/contract.md',
      'claude/packages/spec-flow/skills/draft/scripts/check.ts',
      'codex/.agents/plugins/marketplace.json',
      'codex/packages/commit/.codex-plugin/plugin.json',
      'codex/packages/commit/hooks/destructive-vcs-guard.sh',
      'codex/packages/commit/hooks/hooks.json',
      'codex/packages/commit/skills/commit/SKILL.md',
      'codex/packages/craft/.codex-plugin/plugin.json',
      'codex/packages/craft/skills/tdd/SKILL.md',
      'codex/packages/librarian/.codex-plugin/plugin.json',
      'codex/packages/librarian/agents/vault-reader.md',
      'codex/packages/librarian/skills/wiki-query/SKILL.md',
      'codex/packages/linear/.codex-plugin/plugin.json',
      'codex/packages/linear/skills/linear/SKILL.md',
      'codex/packages/spec-flow/.codex-plugin/plugin.json',
      'codex/packages/spec-flow/LICENSE.txt',
      'codex/packages/spec-flow/config/defaults.json',
      'codex/packages/spec-flow/skills/draft/SKILL.md',
      'codex/packages/spec-flow/skills/draft/agents/openai.yaml',
      'codex/packages/spec-flow/skills/draft/assets/logo.txt',
      'codex/packages/spec-flow/skills/draft/references/contract.md',
      'codex/packages/spec-flow/skills/draft/scripts/check.ts',
      'codex/packages/spec-flow/skills/spec-flow/SKILL.md',
      'codex/packages/spec-flow/skills/spec-flow/agents/openai.yaml',
    ]);
  });

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
    const firstTree = snapshotOutputTree(join(outDir, 'claude'));
    const second = runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude');
    const secondTree = snapshotOutputTree(join(outDir, 'claude'));

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(secondTree).toEqual(firstTree);
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

describe('check command', () => {
  test('accepts the payload corpus cleanly and detects intentional sidecar drift', () => {
    const outDir = join(temporaryRoot, 'payload-drift');
    expect(runCli('compile', MARKETPLACE, '--out', outDir).exitCode).toBe(0);

    const clean = runCli('check', MARKETPLACE, '--out', outDir);
    expect(clean.exitCode).toBe(0);

    const sidecar = join(
      outDir,
      'codex',
      'packages',
      'spec-flow',
      'skills',
      'draft',
      'agents',
      'openai.yaml',
    );
    writeFileSync(sidecar, 'policy: drifted\n');
    if (process.platform !== 'win32') {
      const script = join(
        outDir,
        'codex',
        'packages',
        'spec-flow',
        'skills',
        'draft',
        'scripts',
        'check.ts',
      );
      chmodSync(script, 0o644);
    }
    const drifted = runCli('check', MARKETPLACE, '--out', outDir);

    expect(drifted.exitCode).toBe(1);
    expect(drifted.stderr).toContain(
      'changed-output: codex/packages/spec-flow/skills/draft/agents/openai.yaml: managed output differs',
    );
    if (process.platform !== 'win32') {
      expect(drifted.stderr).toContain(
        'changed-output-mode: codex/packages/spec-flow/skills/draft/scripts/check.ts: managed output mode is 0644; expected 0755',
      );
    }
  });

  test('accepts clean output and keeps translation diagnostics nonfatal', () => {
    const outDir = join(temporaryRoot, 'clean-check');
    expect(runCli('compile', MARKETPLACE, '--out', outDir).exitCode).toBe(0);
    const before = readFileSync(
      join(outDir, 'codex', '.agents', 'plugins', 'marketplace.json'),
      'utf8',
    );

    const result = runCli('check', MARKETPLACE, '--out', outDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[claude] ok: 21 managed files');
    expect(result.stdout).toContain('[codex] ok: 22 managed files');
    expect(result.stdout).toContain(
      'note [codex/librarian] inferred-artifact-projection: Agent "vault-reader" inferred',
    );
    expect(
      readFileSync(join(outDir, 'codex', '.agents', 'plugins', 'marketplace.json'), 'utf8'),
    ).toBe(before);
  });

  test('exits nonzero with actionable drift diagnostics', () => {
    const outDir = join(temporaryRoot, 'drift-check');
    expect(
      runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude').exitCode,
    ).toBe(0);
    writeFileSync(
      join(outDir, 'claude', '.claude-plugin', 'marketplace.json'),
      '{"changed":true}\n',
    );

    const result = runCli('check', MARKETPLACE, '--out', outDir, '--publication', 'claude');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'error [claude] changed-output: claude/.claude-plugin/marketplace.json: managed output differs',
    );
    expect(result.stderr).toContain(
      'error [claude] invalid-native-document: claude/.claude-plugin/marketplace.json:',
    );
  });

  test('runs Claude strict validation only when explicitly requested', () => {
    const outDir = join(temporaryRoot, 'native-check');
    const binDir = join(temporaryRoot, 'bin');
    const argsPath = join(temporaryRoot, 'claude-args.txt');
    mkdirSync(binDir);
    const claude = join(binDir, 'claude');
    writeFileSync(claude, '#!/bin/sh\nprintf "%s\\n" "$@" > "$AGENTFORGE_CLAUDE_ARGS"\n');
    chmodSync(claude, 0o755);
    expect(
      runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude').exitCode,
    ).toBe(0);

    const withoutNative = runCli('check', MARKETPLACE, '--out', outDir, '--publication', 'claude');
    expect(withoutNative.exitCode).toBe(0);
    expect(existsSync(argsPath)).toBe(false);

    const withNative = runCliWithEnv(
      {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        AGENTFORGE_CLAUDE_ARGS: argsPath,
      },
      'check',
      MARKETPLACE,
      '--out',
      outDir,
      '--publication',
      'claude',
      '--claude-native',
    );
    expect(withNative.exitCode).toBe(0);
    expect(readFileSync(argsPath, 'utf8')).toBe(
      `plugin\nvalidate\n--strict\n${join(outDir, 'claude')}\n`,
    );
  });

  if (Bun.which('claude')) {
    test('passes the installed Claude native strict validator', () => {
      const outDir = join(temporaryRoot, 'claude-native-acceptance');
      expect(
        runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'claude').exitCode,
      ).toBe(0);

      const result = Bun.spawnSync({
        cmd: ['claude', 'plugin', 'validate', '--strict', join(outDir, 'claude')],
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain('Validation passed');
    });
  } else {
    test.skip('passes the installed Claude native strict validator', () => {});
  }

  if (CC_MARKETPLACE_PROJECT && Bun.which('uv') && existsSync(CC_MARKETPLACE_PROJECT)) {
    test('passes the cc-marketplace Codex native validator', () => {
      const outDir = join(temporaryRoot, 'codex-native-acceptance');
      expect(
        runCli('compile', MARKETPLACE, '--out', outDir, '--publication', 'codex').exitCode,
      ).toBe(0);

      const result = Bun.spawnSync({
        cmd: [
          'uv',
          'run',
          '--frozen',
          '--project',
          CC_MARKETPLACE_PROJECT,
          'marketplace',
          'validate',
          '--format',
          'codex',
          '--manifest',
          join(outDir, 'codex', '.agents', 'plugins', 'marketplace.json'),
          '--plugins-root',
          join(outDir, 'codex', 'packages'),
        ],
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          UV_CACHE_DIR: join(temporaryRoot, 'uv-cache'),
          UV_PROJECT_ENVIRONMENT: join(temporaryRoot, 'cc-marketplace-venv'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain('Codex validation passed (5 plugins).');
    });
  } else {
    test.skip('passes the cc-marketplace Codex native validator', () => {});
  }
});

function runCli(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  return runCliWithEnv({}, ...args);
}

function runCliWithEnv(
  env: Record<string, string>,
  ...args: string[]
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', CLI, ...args],
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
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
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listRelativeFiles(root, path) : [path.slice(root.length + 1)];
    })
    .toSorted();
}

function snapshotOutputTree(root: string, modeForPath?: (path: string) => number) {
  return listRelativeFiles(root).map((relativePath) => {
    const path = join(root, relativePath);
    return {
      path: relativePath,
      content: readFileSync(path).toString('base64'),
      mode: modeForPath?.(relativePath) ?? statSync(path).mode & 0o777,
    };
  });
}

function expectedMode(relativePath: string): number {
  const executable =
    relativePath.endsWith('/skills/draft/scripts/check.ts') ||
    relativePath.endsWith('/hooks/destructive-vcs-guard.sh');
  return executable ? 0o755 : 0o644;
}
