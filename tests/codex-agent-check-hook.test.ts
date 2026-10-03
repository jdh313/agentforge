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
  // A fake `agentforge` that logs each invocation and reports a status per scope,
  // exiting nonzero for anything but `current`.
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
        '  *"--scope user"*) status=$FAKE_USER ;;',
        '  *) status=$FAKE_PROJECT ;;',
        'esac',
        '[ "$status" = current ] && { echo "current: 3 managed paths at /x"; exit 0; }',
        '[ "$status" = thrown ] && { echo "unsupported: /x: boom" >&2; exit 1; }',
        'echo "$status: 3 managed paths at /x"',
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const project = join(root, 'project');
    mkdirSync(join(project, 'nested/deeper'), { recursive: true });
    const log = join(root, 'log');
    writeFileSync(log, '');
    const run = (env: Record<string, string>, options: { path?: string; cwd?: string } = {}) => {
      const result = Bun.spawnSync(['sh', script], {
        cwd: options.cwd ?? project,
        env: {
          PATH: options.path ?? `${bin}:/usr/bin:/bin`,
          FAKE_LOG: log,
          FAKE_USER: 'current',
          FAKE_PROJECT: 'current',
          ...env,
        },
      });
      const out = result.stdout.toString();
      return {
        code: result.exitCode,
        out,
        message:
          out === '' ? undefined : (JSON.parse(out) as { systemMessage: string }).systemMessage,
        err: result.stderr.toString(),
        log: readFileSync(log, 'utf8'),
      };
    };
    const receipt = (dir: string) => {
      mkdirSync(join(dir, '.codex/agents/.agentforge'), { recursive: true });
      writeFileSync(join(dir, '.codex/agents/.agentforge/demo-roles.json'), '{}');
    };
    return { run, project, receipt, plugin };
  }

  test('is silent and exits 0 when the user scope is current', async () => {
    const { run } = await setup();
    const result = run({});
    expect(result).toMatchObject({ code: 0, out: '', err: '' });
    expect(result.log).toContain('check-codex-agent');
    expect(result.log).toContain('--scope user');
    expect(result.log).not.toContain('--scope project');
  });

  test('prints one systemMessage object and exits 0 when roles are missing', async () => {
    const { run } = await setup();
    const result = run({ FAKE_USER: 'missing' });
    expect(result.code).toBe(0);
    expect(result.out.trim().split('\n')).toHaveLength(1);
    expect(result.message).toBe(
      'demo-roles: agent roles are not current at user scope; run agentforge sync-codex-agents --scope user',
    );
  });

  test.each([
    'edited',
    'conflicted',
    'unsupported',
    'thrown',
  ])('advises a review rather than a sync when the status is %s', async (status) => {
    const { run, plugin } = await setup();
    const result = run({ FAKE_USER: status });
    expect(result.code).toBe(0);
    expect(result.message).toBe(
      `demo-roles: agent roles are not current at user scope; run agentforge check-codex-agent ${join(realpathSync(plugin), '.agentforge/codex-agent-bundle')} --scope user to review`,
    );
  });

  test('prints one line and exits 0 when agentforge is missing', async () => {
    const { run } = await setup();
    const result = run({}, { path: '/usr/bin:/bin' });
    expect(result.code).toBe(0);
    expect(result.message).toBe(
      'demo-roles: AgentForge not found; install a released AgentForge binary from https://github.com/jdh313/agentforge/releases to register agent roles',
    );
  });

  test('is current when the project scope is current even though user is not', async () => {
    const { run, project, receipt } = await setup();
    receipt(project);
    const result = run({ FAKE_USER: 'missing' });
    expect(result).toMatchObject({ code: 0, out: '' });
    expect(result.log).toContain(`--scope project --project-root ${realpathSync(project)}`);
  });

  test('is current when the user scope is current and the project is stale', async () => {
    const { run, project, receipt } = await setup();
    receipt(project);
    const result = run({ FAKE_PROJECT: 'missing' });
    expect(result).toMatchObject({ code: 0, out: '' });
  });

  test('reports the project scope when neither checked scope is current', async () => {
    const { run, project, receipt } = await setup();
    receipt(project);
    const result = run({ FAKE_USER: 'missing', FAKE_PROJECT: 'missing' });
    expect(result.code).toBe(0);
    expect(result.message).toBe(
      'demo-roles: agent roles are not current at project scope; run agentforge sync-codex-agents --scope project',
    );
  });

  test('walks up from a nested working directory to the project receipt', async () => {
    const { run, project, receipt } = await setup();
    receipt(project);
    const result = run(
      { FAKE_USER: 'missing', FAKE_PROJECT: 'edited' },
      { cwd: join(project, 'nested/deeper') },
    );
    expect(result.log).toContain(`--project-root ${realpathSync(project)}`);
    expect(result.message).toContain('at project scope; run agentforge check-codex-agent');
    expect(result.message).toContain(`--project-root ${realpathSync(project)} to review`);
  });

  test('skips the project check when no ancestor holds a receipt', async () => {
    const { run } = await setup();
    const result = run({ FAKE_USER: 'missing' });
    expect(result.log).not.toContain('--scope project');
  });
});
