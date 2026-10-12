import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import { createManagedOutputLock, materializeCompilation } from 'agentforge/materializer';
import { allTargets } from '../src/targets/index.ts';

const repoRoot = join(import.meta.dir, '..');
const fixture = join(import.meta.dir, 'fixtures/definitions/codex-agent-bundle');
const cli = join(repoRoot, 'src/cli.ts');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-agent-lifecycle-cli-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runCli(env: Record<string, string>, ...args: string[]) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', cli, ...args],
    cwd: repoRoot,
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

function snapshotTree(directory: string): unknown[] {
  return readdirSync(directory, { withFileTypes: true }).map((entry) => [
    entry.name,
    entry.isDirectory()
      ? snapshotTree(join(directory, entry.name))
      : readFileSync(join(directory, entry.name)).toString('base64'),
  ]);
}

describe('Codex agent lifecycle CLI', () => {
  for (const scope of ['project', 'user'] as const) {
    test(`${scope} scope previews and removes from receipt after source disappears`, async () => {
      const out = join(root, 'compiled');
      const loaded = await loadMarketplaceDefinition(join(fixture, 'MARKETPLACE.yaml'));
      materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
      const bundle = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
      const project = join(root, 'project');
      const codexHome = join(root, 'codex-home');
      const env = { CODEX_HOME: codexHome };
      const options = ['--scope', scope, '--project-root', project];
      const destination = scope === 'project' ? join(project, '.codex') : codexHome;

      const missing = runCli(env, 'codex', 'agents', 'check', bundle, ...options);
      expect(missing.exitCode).toBe(1);
      expect(missing.stdout).toContain('missing:');
      const beforeInstall = snapshotTree(root);
      const installPreview = runCli(
        env,
        'codex',
        'agents',
        'install',
        bundle,
        ...options,
        '--dry-run',
      );
      expect(installPreview.exitCode).toBe(0);
      expect(installPreview.stdout).toContain('ready: demo-roles:alpha, demo-roles:beta');
      expect(snapshotTree(root)).toEqual(beforeInstall);
      expect(runCli(env, 'codex', 'agents', 'install', bundle, ...options).exitCode).toBe(0);
      expect(existsSync(join(destination, 'agents/demo-roles/alpha.toml'))).toBe(true);
      expect(runCli(env, 'codex', 'agents', 'check', bundle, ...options).exitCode).toBe(0);
      const beforeUpdate = snapshotTree(root);
      expect(
        runCli(env, 'codex', 'agents', 'update', '--dry-run', bundle, ...options).exitCode,
      ).toBe(0);
      expect(snapshotTree(root)).toEqual(beforeUpdate);
      expect(runCli(env, 'codex', 'agents', 'update', bundle, ...options).exitCode).toBe(0);
      const beforeRemove = snapshotTree(root);
      const preview = runCli(
        env,
        'codex',
        'agents',
        'remove',
        '--dry-run',
        'demo-roles',
        ...options,
      );
      expect(preview.exitCode).toBe(0);
      expect(preview.stdout).toContain('remove:');
      expect(snapshotTree(root)).toEqual(beforeRemove);

      const lock = '.agentforge/.agentforge-lifecycle.lock';
      createManagedOutputLock(destination, lock, 'another scope mutation\n');
      expect(runCli(env, 'codex', 'agents', 'remove', 'demo-roles', ...options).exitCode).toBe(1);
      expect(existsSync(join(destination, 'agents/demo-roles/alpha.toml'))).toBe(true);
      rmSync(join(destination, lock));

      rmSync(out, { recursive: true, force: true });
      expect(runCli(env, 'codex', 'agents', 'remove', 'demo-roles', ...options).exitCode).toBe(0);
      expect(existsSync(join(destination, 'agents/demo-roles/alpha.toml'))).toBe(false);
      expect(existsSync(join(destination, 'agents/.agentforge/demo-roles.json'))).toBe(false);
      expect(runCli(env, 'codex', 'agents', 'remove', 'demo-roles', ...options).exitCode).toBe(0);
    });
  }
});
