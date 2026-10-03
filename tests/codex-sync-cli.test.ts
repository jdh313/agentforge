import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import { materializeCompilation } from 'agentforge/materializer';
import { allTargets } from '../src/targets/index.ts';

const repoRoot = join(import.meta.dir, '..');
const fixture = join(import.meta.dir, 'fixtures/definitions/codex-agent-bundle');
const cli = join(repoRoot, 'src/cli.ts');
let root: string;
let codexHome: string;
let project: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-sync-codex-cli-'));
  codexHome = join(root, 'codex-home');
  project = join(root, 'project');
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(project, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runCli(...args: string[]) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', cli, ...args],
    cwd: repoRoot,
    env: { ...process.env, CODEX_HOME: codexHome },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

const sync = (...extra: string[]) =>
  runCli('sync-codex-agents', '--scope', 'user', '--project-root', project, ...extra);

/** Compile the demo fixture under a package id and version, returning its bundle directory. */
async function compileBundle(
  id: string,
  version: string,
  mutate?: (source: string) => void,
): Promise<string> {
  const source = mkdtempSync(join(root, 'source-'));
  cpSync(fixture, source, { recursive: true });
  for (const file of ['MARKETPLACE.yaml', 'packages/demo/PACKAGE.yaml']) {
    const path = join(source, file);
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replaceAll('demo-roles', id).replace('2.3.4', version),
    );
  }
  mutate?.(source);
  const out = join(source, 'compiled');
  const loaded = await loadMarketplaceDefinition(join(source, 'MARKETPLACE.yaml'));
  materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
  return join(out, 'packages/demo/.agentforge/codex-agent-bundle');
}

/** Place a compiled bundle (or nothing) in the plugin cache the way Codex lays it out. */
function cachePlugin(key: string, version: string, bundle: string | undefined) {
  const [name, marketplace] = key.split('@') as [string, string];
  const dir = join(codexHome, 'plugins/cache', marketplace, name, version);
  mkdirSync(dir, { recursive: true });
  if (bundle) cpSync(bundle, join(dir, '.agentforge/codex-agent-bundle'), { recursive: true });
}

function writeConfig(plugins: Record<string, boolean>, path = join(codexHome, 'config.toml')) {
  writeFileSync(
    path,
    Object.entries(plugins)
      .map(([key, enabled]) => `[plugins."${key}"]\nenabled = ${enabled}\n`)
      .join('\n'),
  );
}

const alphaRole = (id: string) => join(codexHome, `agents/${id}/alpha.toml`);

describe('sync-codex-agents', () => {
  test('installs a fresh bundle, then a second run changes nothing', async () => {
    const bundle = await compileBundle('demo-roles', '2.3.4');
    cachePlugin('demo@market', '1.0.0', bundle);
    writeConfig({ 'demo@market': true });

    const first = sync();
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('demo@market demo-roles 2.3.4: installed');
    expect(first.stdout).toContain('summary: 1 installed, 0 updated, 0 current, 0 refused');
    expect(existsSync(alphaRole('demo-roles'))).toBe(true);
    const config = readFileSync(join(codexHome, 'config.toml'), 'utf8');
    expect(config).toContain('demo-roles:alpha');

    const second = sync();
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('demo@market demo-roles 2.3.4: current');
    expect(second.stdout).toContain('summary: 0 installed, 0 updated, 1 current');
    expect(readFileSync(join(codexHome, 'config.toml'), 'utf8')).toBe(config);
  });

  test('updates an installed bundle after the plugin ships a new version', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });
    expect(sync().exitCode).toBe(0);

    cachePlugin('demo@market', '1.1.0', await compileBundle('demo-roles', '2.4.0'));
    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('demo@market demo-roles 2.4.0: updated');
    const receipt = readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8');
    expect(receipt).toContain('2.4.0');
    expect(sync().stdout).toContain('demo-roles 2.4.0: current');
  });

  test('dry run prints the planned action and writes nothing', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });
    const configBefore = readFileSync(join(codexHome, 'config.toml'), 'utf8');

    const planned = sync('--dry-run');
    expect(planned.exitCode).toBe(0);
    expect(planned.stdout).toContain('demo@market demo-roles 2.3.4: install');
    expect(planned.stdout).not.toContain('installed');
    expect(existsSync(join(codexHome, 'agents'))).toBe(false);
    expect(readFileSync(join(codexHome, 'config.toml'), 'utf8')).toBe(configBefore);

    expect(sync().exitCode).toBe(0);
    cachePlugin('demo@market', '1.1.0', await compileBundle('demo-roles', '2.4.0'));
    const receiptPath = join(codexHome, 'agents/.agentforge/demo-roles.json');
    const receiptBefore = readFileSync(receiptPath, 'utf8');
    const update = sync('--dry-run');
    expect(update.stdout).toContain('demo-roles 2.4.0: update');
    expect(readFileSync(receiptPath, 'utf8')).toBe(receiptBefore);
  });

  test('ignores a disabled plugin and silently skips one without a bundle', async () => {
    cachePlugin('off@market', '1.0.0', await compileBundle('off-roles', '1.0.0'));
    cachePlugin('plain@market', '1.0.0', undefined);
    writeConfig({ 'off@market': false, 'plain@market': true });

    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('off@market');
    expect(result.stdout).not.toContain('plain@market');
    expect(result.stdout).toContain('0 refused, 1 skipped');
    expect(result.stdout).toContain('1 disabled');
    expect(existsSync(join(codexHome, 'agents'))).toBe(false);
  });

  test('reports an enabled plugin with no cache and exits 0', () => {
    writeConfig({ 'ghost@market': true });
    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ghost@market: skipped: no cached plugin content');
  });

  test('refuses a duplicate package id for both plugins while another still syncs', async () => {
    const shared = await compileBundle('shared-roles', '1.0.0');
    cachePlugin('librarian@one', '1.0.0', shared);
    cachePlugin('librarian@two', '1.0.0', shared);
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'librarian@one': true, 'librarian@two': true, 'demo@market': true });

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('shared-roles is shipped by librarian@one and librarian@two');
    expect(result.stdout).toContain('demo@market demo-roles 2.3.4: installed');
    expect(existsSync(alphaRole('shared-roles'))).toBe(false);
    expect(existsSync(alphaRole('demo-roles'))).toBe(true);
  });

  test('uses the highest semver version directory and says so', async () => {
    cachePlugin('demo@market', '1.2.0', await compileBundle('demo-roles', '1.2.0'));
    cachePlugin('demo@market', '1.10.0', await compileBundle('demo-roles', '1.10.0'));
    cachePlugin('demo@market', '1.9.0', await compileBundle('demo-roles', '1.9.0'));
    writeConfig({ 'demo@market': true });

    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('using 1.10.0');
    expect(result.stdout).toContain('demo@market demo-roles 1.10.0: installed');
  });

  test('refuses several version directories when none is semver', async () => {
    const bundle = await compileBundle('demo-roles', '1.0.0');
    cachePlugin('demo@market', 'abc123', bundle);
    cachePlugin('demo@market', 'def456', bundle);
    writeConfig({ 'demo@market': true });

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('demo@market: refused:');
    expect(result.stdout).toContain('abc123, def456');
    expect(existsSync(join(codexHome, 'agents'))).toBe(false);
  });

  test('reports an edited installation and exits 1 without writing', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });
    expect(sync().exitCode).toBe(0);
    const role = alphaRole('demo-roles');
    writeFileSync(role, `${readFileSync(role, 'utf8')}# local edit\n`);

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('demo@market demo-roles 2.3.4: refused: edited:');
    expect(readFileSync(role, 'utf8')).toContain('# local edit');
  });

  test('refuses a new bundle version over an edited installation', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });
    expect(sync().exitCode).toBe(0);
    const role = alphaRole('demo-roles');
    writeFileSync(role, `${readFileSync(role, 'utf8')}# local edit\n`);
    cachePlugin('demo@market', '1.1.0', await compileBundle('demo-roles', '2.4.0'));

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('demo-roles 2.4.0: refused:');
    expect(readFileSync(role, 'utf8')).toContain('# local edit');
  });

  test('reads a symlinked config.toml through its anchor and keeps the link', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    const dotfiles = join(root, 'dotfiles');
    mkdirSync(dotfiles);
    const target = join(dotfiles, 'config.toml');
    writeConfig({ 'demo@market': true }, target);
    symlinkSync(target, join(codexHome, 'config.toml'));

    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`plugins config: ${join(codexHome, 'config.toml')} ->`);
    expect(result.stdout).toContain('demo@market demo-roles 2.3.4: installed');
    // The registration landed in the dotfiles target, behind the intact link.
    expect(readFileSync(target, 'utf8')).toContain('demo-roles:alpha');
    expect(readFileSync(target, 'utf8')).toContain('[plugins."demo@market"]');
    expect(sync().stdout).toContain('demo-roles 2.3.4: current');
  });

  test('project scope installs under the project but discovers plugins in the user home', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });

    const result = runCli('sync-codex-agents', '--scope', 'project', '--project-root', project);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(true);
    expect(existsSync(alphaRole('demo-roles'))).toBe(false);
  });

  test('dry run and project scope work with a read-only config.toml target', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    const dotfiles = join(root, 'dotfiles');
    mkdirSync(dotfiles);
    const target = join(dotfiles, 'config.toml');
    writeConfig({ 'demo@market': true }, target);
    symlinkSync(target, join(codexHome, 'config.toml'));
    chmodSync(target, 0o444);
    chmodSync(dotfiles, 0o555);
    try {
      const planned = sync('--dry-run');
      expect(planned.stderr).toBe('');
      expect(planned.exitCode).toBe(0);
      expect(planned.stdout).toContain('demo@market demo-roles 2.3.4: install');
      expect(existsSync(join(codexHome, 'agents'))).toBe(false);

      const projectRun = runCli(
        'sync-codex-agents',
        '--scope',
        'project',
        '--project-root',
        project,
      );
      expect(projectRun.exitCode).toBe(0);
      expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(true);

      // A real write into the user scope keeps its writability check.
      const written = sync();
      expect(written.exitCode).toBe(1);
      expect(written.stdout).toContain('refused:');
      expect(written.stdout).toContain('not writable');
    } finally {
      chmodSync(dotfiles, 0o755);
    }
  });

  test('one unreadable cache entry is refused without stopping the other plugins', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    const broken = join(codexHome, 'plugins/cache/broken/plug');
    mkdirSync(broken, { recursive: true });
    symlinkSync(join(root, 'nowhere'), join(broken, '1.0.0'));
    writeFileSync(join(broken, '1.1.0'), 'not a directory');
    const notDirectory = join(codexHome, 'plugins/cache/odd');
    mkdirSync(notDirectory, { recursive: true });
    writeFileSync(join(notDirectory, 'thing'), 'a file where a directory belongs');
    writeConfig({ 'plug@broken': true, 'thing@odd': true, 'demo@market': true });

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('demo@market demo-roles 2.3.4: installed');
    expect(result.stdout).toContain('thing@odd: refused:');
    expect(existsSync(alphaRole('demo-roles'))).toBe(true);
  });

  test('refuses to downgrade an installed bundle to an older cached version', async () => {
    const newer = join(codexHome, 'plugins/cache/market/demo/1.0.0');
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.4.0'));
    writeConfig({ 'demo@market': true });
    expect(sync().exitCode).toBe(0);
    rmSync(newer, { recursive: true });
    cachePlugin('demo@market', '0.9.0', await compileBundle('demo-roles', '2.3.4'));

    const result = sync();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      'refused: cached demo-roles 2.3.4 is older than installed 2.4.0; update the plugin in Codex',
    );
    expect(readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8')).toContain(
      '2.4.0',
    );
  });

  test('updates when the cached version equals the installed one but the content differs', async () => {
    cachePlugin('demo@market', '1.0.0', await compileBundle('demo-roles', '2.3.4'));
    writeConfig({ 'demo@market': true });
    expect(sync().exitCode).toBe(0);
    rmSync(join(codexHome, 'plugins/cache/market/demo/1.0.0'), { recursive: true });
    const changed = await compileBundle('demo-roles', '2.3.4', (source) => {
      const agent = join(source, 'packages/demo/agents/alpha.md');
      writeFileSync(agent, `${readFileSync(agent, 'utf8')}\nExtra guidance.\n`);
    });
    cachePlugin('demo@market', '1.0.0', changed);

    const result = sync();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('demo@market demo-roles 2.3.4: updated');
    expect(readFileSync(alphaRole('demo-roles'), 'utf8')).toContain('Extra guidance.');
  });
});
