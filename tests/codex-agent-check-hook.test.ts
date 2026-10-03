import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import { allTargets } from '../src/targets/index.ts';

const FIXTURE = join(import.meta.dir, 'fixtures', 'definitions', 'codex-agent-bundle');
const HOOK = 'packages/demo/hooks/agentforge-codex-agents.json';
const SCRIPT = 'packages/demo/.agentforge/check-codex-agents.sh';
const AUTHOR_HOOKS = {
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo author' }] }] },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-codex-check-hook-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function compile(options: { authorHooks?: boolean; bundle?: boolean } = {}) {
  const source = join(root, 'source');
  cpSync(FIXTURE, source, { recursive: true });
  const packageFile = join(source, 'packages/demo/PACKAGE.yaml');
  let yaml = readFileSync(packageFile, 'utf8');
  if (options.bundle === false) yaml = yaml.replace('    codex-agent-bundle: true\n', '');
  if (options.authorHooks) {
    yaml = yaml.replace(
      'artifacts:\n',
      'artifacts:\n  - type: hook\n    pattern: hooks/hooks.json\n',
    );
    mkdirSync(join(source, 'packages/demo/hooks'));
    writeFileSync(join(source, 'packages/demo/hooks/hooks.json'), JSON.stringify(AUTHOR_HOOKS));
  }
  writeFileSync(packageFile, yaml);
  const loaded = await loadMarketplaceDefinition(join(source, 'MARKETPLACE.yaml'));
  return compileMarketplace(loaded, allTargets(), { outputRoot: join(root, 'out') });
}

function generated(plan: Awaited<ReturnType<typeof compile>>, destination: string) {
  const output = plan.outputs.find((candidate) => candidate.destination === destination);
  return output?.kind === 'generated' ? output.content : undefined;
}

function manifestHooks(plan: Awaited<ReturnType<typeof compile>>) {
  return JSON.parse(generated(plan, 'packages/demo/.codex-plugin/plugin.json') ?? '{}').hooks;
}

describe('Codex agent bundle SessionStart check hook', () => {
  test('emits a hook file, a script, and a manifest entry for a bundle package', async () => {
    const plan = await compile();
    const hook = JSON.parse(generated(plan, HOOK) ?? 'null');
    const handler = hook.hooks.SessionStart[0].hooks[0];
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Codex's literal hook env var is the assertion.
    expect(handler.command).toBe('sh "${PLUGIN_ROOT}/.agentforge/check-codex-agents.sh"');
    expect(handler.timeout).toBe(10);
    expect(generated(plan, SCRIPT)).toContain("package_id='demo-roles'");
    expect(manifestHooks(plan)).toBe('./hooks/agentforge-codex-agents.json');
    expect(generated(plan, 'packages/demo/skills/setup-codex-agents/SKILL.md')).toContain(
      'agentforge sync-codex-agents --scope user',
    );
  });

  test('emits nothing for a package without the flag', async () => {
    const plan = await compile({ bundle: false });
    expect(generated(plan, HOOK)).toBeUndefined();
    expect(generated(plan, SCRIPT)).toBeUndefined();
    expect(manifestHooks(plan)).toBeUndefined();
  });

  test('keeps the author hooks.json untouched and lists both files', async () => {
    const plan = await compile({ authorHooks: true });
    const author = JSON.parse(generated(plan, 'packages/demo/hooks/hooks.json') ?? 'null');
    expect(author).toEqual(AUTHOR_HOOKS);
    expect(Object.keys(author.hooks)).toEqual(['Stop']);
    expect(manifestHooks(plan)).toEqual([
      './hooks/agentforge-codex-agents.json',
      './hooks/hooks.json',
    ]);
  });
});

describe('generated check script behavior', () => {
  // A fake `agentforge` that logs each invocation and exits per scope.
  async function setup() {
    const plan = await compile();
    const plugin = join(root, 'plugin');
    mkdirSync(join(plugin, '.agentforge'), { recursive: true });
    const script = join(plugin, '.agentforge/check-codex-agents.sh');
    writeFileSync(script, generated(plan, SCRIPT) ?? '');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const fake = join(bin, 'agentforge');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        'echo "$*" >> "$FAKE_LOG"',
        'case "$*" in',
        '  *"--scope user"*) exit "$FAKE_USER" ;;',
        '  *) exit "$FAKE_PROJECT" ;;',
        'esac',
        '',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const project = join(root, 'project');
    mkdirSync(project);
    const log = join(root, 'log');
    writeFileSync(log, '');
    const run = (env: Record<string, string>, path = `${bin}:/usr/bin:/bin`) => {
      const result = Bun.spawnSync(['sh', script], {
        cwd: project,
        env: { PATH: path, FAKE_LOG: log, FAKE_USER: '0', FAKE_PROJECT: '0', ...env },
      });
      return {
        code: result.exitCode,
        out: result.stdout.toString(),
        err: result.stderr.toString(),
        log: readFileSync(log, 'utf8'),
      };
    };
    return { run, project };
  }

  test('is silent and exits 0 when the user scope is current', async () => {
    const { run } = await setup();
    const result = run({});
    expect(result).toMatchObject({ code: 0, out: '', err: '' });
    expect(result.log).toContain('check-codex-agent');
    expect(result.log).toContain('--scope user');
    expect(result.log).not.toContain('--scope project');
  });

  test('prints one line and exits 0 when the user scope is not current', async () => {
    const { run } = await setup();
    const result = run({ FAKE_USER: '1' });
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      'demo-roles agent roles are not current for user: run agentforge sync-codex-agents --scope user\n',
    );
  });

  test('prints one line and exits 0 when agentforge is missing', async () => {
    const { run } = await setup();
    const result = run({}, '/usr/bin:/bin');
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      'demo-roles: agentforge not found; install a release from https://github.com/jdh313/agentforge/releases to register agent roles\n',
    );
  });

  test('checks project scope only when a receipt exists', async () => {
    const { run, project } = await setup();
    mkdirSync(join(project, '.codex/agents/.agentforge'), { recursive: true });
    writeFileSync(join(project, '.codex/agents/.agentforge/demo-roles.json'), '{}');
    const current = run({});
    expect(current).toMatchObject({ code: 0, out: '' });
    expect(current.log).toContain(`--scope project --project-root ${realpathSync(project)}`);
    const stale = run({ FAKE_PROJECT: '1' });
    expect(stale.code).toBe(0);
    expect(stale.out).toBe(
      'demo-roles agent roles are not current for project: run agentforge sync-codex-agents --scope project\n',
    );
  });
});
