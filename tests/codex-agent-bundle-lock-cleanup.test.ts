import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import * as materializerModule from '../src/materializer.ts';
import { allTargets } from '../src/targets/index.ts';

// Wraps the real materializer so a test can fire a side effect the instant the
// scope lock exists, which is the only way to move a link "mid-install". With
// no hook armed every call passes straight through.
// Snapshot first: mock.module rebinds the namespace, so reading it later would
// call the wrapper again.
const realMaterializer = { ...materializerModule };
const hooks: { afterLock?: () => void; failLockRelease?: boolean } = {};
mock.module('../src/materializer.ts', () => ({
  ...realMaterializer,
  createManagedOutputLock: (
    ...args: Parameters<typeof realMaterializer.createManagedOutputLock>
  ) => {
    realMaterializer.createManagedOutputLock(...args);
    const hook = hooks.afterLock;
    hooks.afterLock = undefined;
    hook?.();
  },
  materializeCompilationOutputChanges: (
    ...args: Parameters<typeof realMaterializer.materializeCompilationOutputChanges>
  ) => {
    if (
      hooks.failLockRelease &&
      args[2].some((path) => path.endsWith('.agentforge-lifecycle.lock'))
    )
      throw new Error('simulated lock release failure');
    return realMaterializer.materializeCompilationOutputChanges(...args);
  },
}));

const { buildCodexAgentBundleInstallPlan, materializeCodexAgentBundleInstallPlan } = await import(
  'agentforge/codex-agent-bundle'
);

const FIXTURE = join(import.meta.dir, 'fixtures', 'definitions', 'codex-agent-bundle');
let temporaryRoot: string;
beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-lock-cleanup-'));
  hooks.afterLock = undefined;
  hooks.failLockRelease = false;
});
afterEach(() => {
  hooks.afterLock = undefined;
  hooks.failLockRelease = false;
  rmSync(temporaryRoot, { recursive: true, force: true });
});

async function scenario() {
  const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
  const out = join(temporaryRoot, 'compiled');
  realMaterializer.materializeCompilation(
    compileMarketplace(loaded, allTargets(), { outputRoot: out }),
    out,
  );
  const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
  const codexHome = join(temporaryRoot, 'codex-home');
  const dotfiles = join(temporaryRoot, 'dotfiles');
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(join(dotfiles, 'agents'), { recursive: true });
  const config = join(dotfiles, 'config.toml');
  writeFileSync(config, 'model = "kept"\n');
  chmodSync(config, 0o600);
  symlinkSync(config, join(codexHome, 'config.toml'));
  symlinkSync(join(dotfiles, 'agents'), join(codexHome, 'agents'));
  const options = {
    bundleRoot,
    scope: 'user' as const,
    projectRoot: join(temporaryRoot, 'project'),
    codexHomeDirectory: codexHome,
  };
  const other = join(temporaryRoot, 'other.toml');
  writeFileSync(other, '');
  const repointConfig = () => {
    rmSync(join(codexHome, 'config.toml'));
    symlinkSync(other, join(codexHome, 'config.toml'));
  };
  return { options, codexHome, config, repointConfig };
}

const LOCK = '.agentforge/.agentforge-lifecycle.lock';

test('a config link repointed mid-install surfaces its own error and releases the lock', async () => {
  const { options, codexHome, config, repointConfig } = await scenario();
  const install = buildCodexAgentBundleInstallPlan(options);
  hooks.afterLock = repointConfig;
  expect(() => materializeCodexAgentBundleInstallPlan(install)).toThrow('no longer resolves');
  expect(existsSync(join(codexHome, LOCK))).toBe(false);

  // A follow-up install is not refused for an incomplete lifecycle operation.
  rmSync(join(codexHome, 'config.toml'));
  symlinkSync(config, join(codexHome, 'config.toml'));
  materializeCodexAgentBundleInstallPlan(buildCodexAgentBundleInstallPlan(options));
  expect(existsSync(join(codexHome, 'agents/.agentforge/demo-roles.json'))).toBe(true);
});

test('a failing lock release is attached to the primary error instead of replacing it', async () => {
  const { options, codexHome, repointConfig } = await scenario();
  const install = buildCodexAgentBundleInstallPlan(options);
  hooks.afterLock = repointConfig;
  hooks.failLockRelease = true;
  let thrown: unknown;
  try {
    materializeCodexAgentBundleInstallPlan(install);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  const message = (thrown as Error).message;
  expect(message).toContain('no longer resolves');
  expect(message).toContain('cleanup failed: simulated lock release failure');
  // The release failed on purpose, so the lock is still there to be cleared by hand.
  expect(existsSync(join(codexHome, LOCK))).toBe(true);
});
