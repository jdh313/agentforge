import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCompilationSnapshot } from 'agentforge/check';
import {
  buildCodexAgentBundleInstallPlan,
  buildCodexAgentBundleRemovePlan,
  buildCodexAgentBundleUpdatePlan,
  CODEX_AGENT_BUNDLE_INDEX,
  checkCodexAgentBundleInstallPlan,
  compileCodexAgentBundle,
  materializeCodexAgentBundleInstallPlan,
  materializeCodexAgentBundleLifecyclePlan,
  previewCodexAgentBundleLifecyclePlan,
  repairCodexAgentBundleLifecyclePlan,
} from 'agentforge/codex-agent-bundle';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import {
  materializeCompilation,
  materializeCompilationOutputChanges,
} from 'agentforge/materializer';
import matter from 'gray-matter';
import { allTargets } from '../src/targets/index.ts';

const FIXTURE = join(import.meta.dir, 'fixtures', 'definitions', 'codex-agent-bundle');
const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
const LEGACY_FIXTURE = join(import.meta.dir, 'fixtures', 'dispatch-probe');
const CLAUDE_FIELDS_FIXTURE = join(import.meta.dir, 'fixtures', 'agent-claude-fields');
let temporaryRoot: string;
beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-codex-agent-bundle-'));
});
afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('compiled Codex package agent bundle', () => {
  test('emits a deterministic versioned bundle while retaining package procedures', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const one = compileMarketplace(loaded, allTargets(), {
      outputRoot: join(temporaryRoot, 'one'),
    });
    const two = compileMarketplace(loaded, allTargets(), {
      outputRoot: join(temporaryRoot, 'two'),
    });
    expect(
      one.outputs.map((output) => [
        output.destination,
        output.kind === 'generated' ? output.content : '',
      ]),
    ).toEqual(
      two.outputs.map((output) => [
        output.destination,
        output.kind === 'generated' ? output.content : '',
      ]),
    );
    const marketplace = one.outputs.find(
      ({ destination }) => destination === '.agents/plugins/marketplace.json',
    );
    const pluginManifest = one.outputs.find(
      ({ destination }) => destination === 'packages/demo/.codex-plugin/plugin.json',
    );
    expect(marketplace?.kind).toBe('generated');
    expect(pluginManifest?.kind).toBe('generated');
    if (marketplace?.kind !== 'generated' || pluginManifest?.kind !== 'generated') {
      throw new Error('missing generated Codex native identifiers');
    }
    expect(JSON.parse(marketplace.content)).toMatchObject({ name: 'codex-agent-bundle' });
    expect(JSON.parse(pluginManifest.content)).toMatchObject({ name: 'demo-roles' });
    expect(JSON.parse(marketplace.content).name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(JSON.parse(pluginManifest.content).name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const index = one.outputs.find(({ destination }) =>
      destination.endsWith(CODEX_AGENT_BUNDLE_INDEX),
    );
    expect(index?.kind).toBe('generated');
    if (!index || index.kind !== 'generated') throw new Error('missing index');
    expect(JSON.parse(index.content)).toMatchObject({
      schema: 'agentforge.codex-agent-bundle/v2',
      package: { id: 'demo-roles', version: '2.3.4' },
      agents: [
        { id: 'alpha', name: 'demo-roles:alpha', definition: 'agents/alpha.toml' },
        { id: 'beta', name: 'demo-roles:beta', definition: 'agents/beta.toml' },
      ],
    });
    expect(JSON.parse(index.content).agents).toMatchObject([
      {
        execution: {
          model: { source: 'explicit', value: 'gpt-5.6-terra' },
          effort: { source: 'explicit', value: 'high' },
        },
        losses: ['tools', 'disallowedTools', 'permissionMode'],
      },
      {
        execution: {
          model: { source: 'inherited' },
          effort: { source: 'explicit', value: 'low' },
        },
        losses: [],
      },
    ]);
    expect(one.outputs.some(({ destination }) => destination.endsWith('/agents/alpha.md'))).toBe(
      true,
    );
    const setupSkill = one.outputs.find(
      ({ destination }) => destination === 'packages/demo/skills/setup-codex-agents/SKILL.md',
    );
    expect(setupSkill?.kind).toBe('generated');
    if (!setupSkill || setupSkill.kind !== 'generated') throw new Error('missing setup skill');
    const setup = matter(setupSkill.content);
    expect(setup.data).toEqual({
      name: 'setup-codex-agents',
      description: 'Register this plugin’s optional Codex agent roles for one scope.',
    });
    expect(setup.content).toContain('this active `SKILL.md`');
    expect(setup.content).toContain('sh "$script" install user');
    expect(setup.content).toContain('sh "$script" update project \'<project-root>\'');
    expect(setup.content).toContain('sh "$script" check project \'<project-root>\'');
    expect(setup.content).toContain('sh "$script" remove project \'<project-root>\'');
    expect(setup.content).toContain('A version number alone is not compatibility evidence.');
    expect(setup.content).not.toContain('.codex/plugins/cache/');
    expect(setup.content).toContain('`demo-roles:alpha`');
    expect(setup.content).toContain('`demo-roles:beta`');
    expect(setup.content).toContain('pass its emitted identity unchanged as\n`agent_type`');
    expect(
      one.outputs.some(
        ({ destination }) =>
          destination === 'packages/demo/skills/setup-codex-agents/agents/openai.yaml',
      ),
    ).toBe(true);
    const setupScript = one.outputs.find(
      ({ destination }) =>
        destination ===
        'packages/demo/skills/setup-codex-agents/scripts/manage-codex-agent-bundle.sh',
    );
    expect(setupScript).toMatchObject({ kind: 'generated' });
    expect(setupScript?.kind === 'generated' && setupScript.content).toContain(
      'plugin_root=$(CDPATH= cd "$script_dir/../../.." && pwd -P)',
    );
    expect(setupScript?.kind === 'generated' && setupScript.content).toContain(
      'package_id="demo-roles"',
    );
    expect(setupScript?.kind === 'generated' && setupScript.content).toContain(
      'preview_subcommand=preview-codex-agent-update',
    );
    expect(setupScript?.kind === 'generated' && setupScript.content).toContain(
      'preview_subcommand=preview-codex-agent-remove',
    );
    expect(one.diagnostics.map(({ message }) => message).join('\n')).toContain(
      'stripped tools, disallowedTools, permissionMode',
    );
  });

  test('runs the compiled setup script from a fresh plugin copy for both scopes', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const installedPlugin = join(temporaryRoot, 'fresh-installed-plugin');
    cpSync(join(out, 'packages/demo'), installedPlugin, { recursive: true });
    const script = join(
      installedPlugin,
      'skills/setup-codex-agents/scripts/manage-codex-agent-bundle.sh',
    );
    const wrapper = join(temporaryRoot, 'agentforge-current');
    const trace = join(temporaryRoot, 'agentforge-trace');
    writeFileSync(
      wrapper,
      `#!/bin/sh\nif [ -n "$AGENTFORGE_TRACE" ]; then printf '%s\\n' "$1" >> "$AGENTFORGE_TRACE"; fi\nexec ${JSON.stringify(process.execPath)} run ${JSON.stringify(CLI)} "$@"\n`,
    );
    chmodSync(wrapper, 0o755);

    const missing = runSetupScript(
      script,
      { AGENTFORGE_BIN: join(temporaryRoot, 'missing') },
      'install',
      'user',
    );
    expect(missing.exitCode).toBe(69);
    expect(missing.stderr).toContain('AgentForge is missing or incompatible');
    expect(missing.stderr).toContain('https://github.com/jdh313/agentforge/releases');

    const incompatible = join(temporaryRoot, 'agentforge-incompatible');
    writeFileSync(incompatible, '#!/bin/sh\nexit 1\n');
    chmodSync(incompatible, 0o755);
    const rejected = runSetupScript(script, { AGENTFORGE_BIN: incompatible }, 'install', 'user');
    expect(rejected.exitCode).toBe(69);
    expect(rejected.stderr).toContain('install-codex-agent --help');

    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'codex-home');
    const previewFailure = join(temporaryRoot, 'agentforge-preview-failure');
    const previewFailureTrace = join(temporaryRoot, 'agentforge-preview-failure-trace');
    writeFileSync(
      previewFailure,
      `#!/bin/sh\nif [ "$2" = "--help" ]; then exit 0; fi\nprintf '%s\\n' "$1" >> "$AGENTFORGE_TRACE"\nif [ "$1" = "preview-codex-agent-update" ]; then exit 87; fi\nexit 0\n`,
    );
    chmodSync(previewFailure, 0o755);
    const stopped = runSetupScript(
      script,
      { AGENTFORGE_BIN: previewFailure, AGENTFORGE_TRACE: previewFailureTrace },
      'update',
      'user',
    );
    expect(stopped.exitCode).toBe(87);
    expect(readFileSync(previewFailureTrace, 'utf8')).toBe('preview-codex-agent-update\n');

    for (const scope of ['user', 'project'] as const) {
      const scopeArgs = scope === 'user' ? [scope] : [scope, project];
      const env = { AGENTFORGE_BIN: wrapper, AGENTFORGE_TRACE: trace, CODEX_HOME: codexHome };
      expect(runSetupScript(script, env, 'install', ...scopeArgs).exitCode).toBe(0);
      expect(runSetupScript(script, env, 'check', ...scopeArgs).exitCode).toBe(0);
      expect(runSetupScript(script, env, 'update', ...scopeArgs).exitCode).toBe(0);
    }
    expect(readFileSync(trace, 'utf8')).toContain(
      'preview-codex-agent-update\nupdate-codex-agent\n',
    );

    rmSync(join(installedPlugin, '.agentforge/codex-agent-bundle'), {
      recursive: true,
      force: true,
    });
    for (const scope of ['user', 'project'] as const) {
      const scopeArgs = scope === 'user' ? [scope] : [scope, project];
      expect(
        runSetupScript(
          script,
          { AGENTFORGE_BIN: wrapper, AGENTFORGE_TRACE: trace, CODEX_HOME: codexHome },
          'remove',
          ...scopeArgs,
        ).exitCode,
      ).toBe(0);
      const root = scope === 'user' ? codexHome : join(project, '.codex');
      expect(existsSync(join(root, 'agents/.agentforge/demo-roles.json'))).toBe(false);
    }
    expect(readFileSync(trace, 'utf8')).toContain(
      'preview-codex-agent-remove\nremove-codex-agent\n',
    );
  });

  test('reserves the generated setup skill name from package commands and skills', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const demo = loaded.packages.get('demo-roles');
    if (!demo) throw new Error('missing demo package');
    for (const artifactType of ['command', 'skill']) {
      const artifacts = new Map(demo.artifacts);
      artifacts.set(artifactType, [
        {
          path: join(FIXTURE, `packages/demo/${artifactType}s/setup-codex-agents.md`),
          content:
            '---\nname: setup-codex-agents\ndescription: Conflicts with generated setup.\n---\n\nConflict.\n',
        },
      ]);
      const packages = new Map(loaded.packages);
      packages.set('demo-roles', { ...demo, artifacts });

      expect(() => compileMarketplace({ ...loaded, packages }, allTargets())).toThrow(
        'reserves skill name "setup-codex-agents"',
      );
    }
  });

  test('installs every validated role and preserves siblings', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    const plan = compileMarketplace(loaded, allTargets(), { outputRoot: out });
    materializeCompilation(plan, out);
    expect(checkCompilationSnapshot(plan, out).issues).toEqual([]);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    mkdirSync(join(project, '.codex/agents'), { recursive: true });
    writeFileSync(join(project, '.codex/agents/sibling.toml'), 'name = "sibling"\n');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(readFileSync(join(project, '.codex/agents/alpha.toml'), 'utf8')).toContain(
      'name = "demo-roles:alpha"',
    );
    expect(readFileSync(join(project, '.codex/agents/beta.toml'), 'utf8')).not.toContain('model =');
    expect(readFileSync(join(project, '.codex/agents/sibling.toml'), 'utf8')).toBe(
      'name = "sibling"\n',
    );
    expect(readFileSync(join(project, '.codex/config.toml'), 'utf8')).toContain(
      '[agents."demo-roles:beta"]',
    );
    expect(
      checkCodexAgentBundleInstallPlan(
        buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
      ),
    ).toMatchObject({ status: 'current' });
    const alphaPath = join(project, '.codex/agents/alpha.toml');
    const beforeRepeat = statSync(alphaPath);
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const afterRepeat = statSync(alphaPath);
    expect(afterRepeat.ino).toBe(beforeRepeat.ino);
    expect(afterRepeat.mtimeMs).toBe(beforeRepeat.mtimeMs);
  });

  test('records scope-local ownership and preserves an edited managed role', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const codexHome = join(temporaryRoot, 'codex-home');
    const install = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'user',
      projectRoot: temporaryRoot,
      codexHomeDirectory: codexHome,
    });
    materializeCodexAgentBundleInstallPlan(install);
    const receipt = JSON.parse(
      readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8'),
    );
    expect(receipt).toMatchObject({
      schema: 'agentforge.codex-agent-receipt/v3',
      owner: { packageId: 'demo-roles', packageVersion: '2.3.4' },
    });
    expect(receipt.agents).toEqual(
      expect.arrayContaining([
        {
          id: 'alpha',
          name: 'demo-roles:alpha',
          destination: 'agents/alpha.toml',
          installedSha256: expect.any(String),
        },
      ]),
    );
    const definitionPath = join(codexHome, 'agents/alpha.toml');
    writeFileSync(definitionPath, 'name = "edited-by-user"\n');
    const repeat = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'user',
      projectRoot: temporaryRoot,
      codexHomeDirectory: codexHome,
    });
    expect(checkCodexAgentBundleInstallPlan(repeat)).toMatchObject({ status: 'edited' });
    expect(() => materializeCodexAgentBundleInstallPlan(repeat)).toThrow(
      'managed definition differs',
    );
    expect(readFileSync(definitionPath, 'utf8')).toBe('name = "edited-by-user"\n');
  });

  test('keeps v2 project and custom user-scope receipts isolated', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'custom-codex-home');
    const projectInstall = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    const userInstall = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    materializeCodexAgentBundleInstallPlan(projectInstall);
    materializeCodexAgentBundleInstallPlan(userInstall);
    const projectReceiptPath = join(project, '.codex/agents/.agentforge/demo-roles.json');
    const projectReceipt = readFileSync(projectReceiptPath, 'utf8');
    writeFileSync(join(codexHome, 'agents/alpha.toml'), 'name = "user-scope-edit"\n');
    expect(
      checkCodexAgentBundleInstallPlan(
        buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
      ),
    ).toMatchObject({ status: 'current' });
    expect(
      checkCodexAgentBundleInstallPlan(
        buildCodexAgentBundleInstallPlan({
          bundleRoot,
          scope: 'user',
          projectRoot: project,
          codexHomeDirectory: codexHome,
        }),
      ),
    ).toMatchObject({ status: 'edited' });
    expect(readFileSync(projectReceiptPath, 'utf8')).toBe(projectReceipt);

    const homeDirectory = join(temporaryRoot, 'default-home');
    expect(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'user',
        projectRoot: project,
        homeDirectory,
      }).destinationRoot,
    ).toBe(join(homeDirectory, '.codex'));
  });

  test('updates a v3 receipt-owned bundle and records the new bundle version', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.package.version = '2.3.5';
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

    const update = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(previewCodexAgentBundleLifecyclePlan(update)).toMatchObject({ status: 'ready' });
    materializeCodexAgentBundleLifecyclePlan(update);
    expect(
      JSON.parse(readFileSync(join(project, '.codex/agents/.agentforge/demo-roles.json'), 'utf8')),
    ).toMatchObject({ owner: { packageVersion: '2.3.5' } });
  });

  test('updates changed definitions and added, renamed, and deleted roles in project and user scopes', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'codex-home');
    const contexts = [
      { scope: 'project' as const, projectRoot: project, root: join(project, '.codex') },
      {
        scope: 'user' as const,
        projectRoot: project,
        codexHomeDirectory: codexHome,
        root: codexHome,
      },
    ];
    for (const context of contexts) {
      materializeCodexAgentBundleInstallPlan(
        buildCodexAgentBundleInstallPlan({ bundleRoot, ...context }),
      );
    }
    const alphaPath = join(bundleRoot, 'agents/alpha.toml');
    const gammaPath = join(bundleRoot, 'agents/gamma.toml');
    const alpha = readFileSync(alphaPath, 'utf8').replace(
      'Explicit Codex model',
      'Updated explicit Codex model',
    );
    const gamma = readFileSync(join(bundleRoot, 'agents/beta.toml'), 'utf8').replace(
      'demo-roles:beta',
      'demo-roles:gamma',
    );
    writeFileSync(alphaPath, alpha);
    writeFileSync(gammaPath, gamma);
    rmSync(join(bundleRoot, 'agents/beta.toml'));
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const beta = index.agents.find((agent: { id: string }) => agent.id === 'beta');
    index.package.version = '2.4.0';
    index.agents = index.agents
      .filter((agent: { id: string }) => agent.id === 'alpha')
      .map((agent: { sha256: string; [key: string]: unknown }) => ({
        ...agent,
        sha256: createHash('sha256').update(alpha).digest('hex'),
      }));
    index.agents.push({
      ...beta,
      id: 'gamma',
      name: 'demo-roles:gamma',
      definition: 'agents/gamma.toml',
      sha256: createHash('sha256').update(gamma).digest('hex'),
    });
    index.agents.sort((left: { id: string }, right: { id: string }) =>
      left.id.localeCompare(right.id),
    );
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    for (const context of contexts) {
      const update = buildCodexAgentBundleUpdatePlan({ bundleRoot, ...context });
      materializeCodexAgentBundleLifecyclePlan(update);
      expect(readFileSync(join(context.root, 'agents/alpha.toml'), 'utf8')).toContain(
        'Updated explicit Codex model',
      );
      expect(existsSync(join(context.root, 'agents/gamma.toml'))).toBe(true);
      expect(existsSync(join(context.root, 'agents/beta.toml'))).toBe(false);
    }
  });

  test('refuses an unowned added role file or registration table during update', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const gamma = readFileSync(join(bundleRoot, 'agents/beta.toml'), 'utf8').replace(
      'demo-roles:beta',
      'demo-roles:gamma',
    );
    writeFileSync(join(bundleRoot, 'agents/gamma.toml'), gamma);
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const beta = index.agents.find((agent: { id: string }) => agent.id === 'beta');
    index.agents.push({
      ...beta,
      id: 'gamma',
      name: 'demo-roles:gamma',
      definition: 'agents/gamma.toml',
      sha256: createHash('sha256').update(gamma).digest('hex'),
    });
    index.agents.sort((left: { id: string }, right: { id: string }) =>
      left.id.localeCompare(right.id),
    );
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const gammaDestination = join(project, '.codex/agents/gamma.toml');
    writeFileSync(gammaDestination, 'foreign\n');
    expect(
      buildCodexAgentBundleUpdatePlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toMatchObject({
      status: 'refused',
      issues: [expect.objectContaining({ message: expect.stringContaining('unowned definition') })],
    });
    rmSync(gammaDestination);
    writeFileSync(
      join(project, '.codex/config.toml'),
      `${readFileSync(join(project, '.codex/config.toml'), 'utf8')}\n[agents."demo-roles:gamma"]\nconfig_file = "agents/gamma.toml"\ndescription = "foreign"\n`,
    );
    expect(
      buildCodexAgentBundleUpdatePlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toMatchObject({
      status: 'refused',
      issues: [
        expect.objectContaining({ message: expect.stringContaining('unowned role registration') }),
      ],
    });
  });

  test('removes clean owned roles, preserves edited roles, and keeps scope-local ownership', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'codex-home');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'user',
        projectRoot: project,
        codexHomeDirectory: codexHome,
      }),
    );
    writeFileSync(join(codexHome, 'agents/alpha.toml'), 'name = "edited"\n');
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    expect(previewCodexAgentBundleLifecyclePlan(remove).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'preserve', path: join(codexHome, 'agents/alpha.toml') }),
      ]),
    );
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(readFileSync(join(codexHome, 'agents/alpha.toml'), 'utf8')).toBe('name = "edited"\n');
    expect(existsSync(join(codexHome, 'agents/beta.toml'))).toBe(false);
    expect(existsSync(join(project, '.codex/agents/beta.toml'))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8'))
        .agents,
    ).toHaveLength(1);
  });

  test('removes clean peers but retains a missing v3 definition whose registration cannot be proven unedited', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'codex-home');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'user',
        projectRoot: project,
        codexHomeDirectory: codexHome,
      }),
    );
    rmSync(join(codexHome, 'agents/beta.toml'));
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    expect(remove.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'remove', path: join(codexHome, 'agents/alpha.toml') }),
        expect.objectContaining({ kind: 'preserve', path: join(codexHome, 'agents/beta.toml') }),
      ]),
    );
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(existsSync(join(codexHome, 'agents/alpha.toml'))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8'))
        .agents,
    ).toEqual([expect.objectContaining({ id: 'beta' })]);
  });

  test('refuses an interrupted lifecycle until repair completes it from the exact prior state', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const planned = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    const journalPath = join(project, '.codex/agents/.agentforge/.agentforge-lifecycle.lock');
    writeFileSync(
      journalPath,
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v1',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        after: planned.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: planned.removals,
      })}\n`,
    );
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(previewCodexAgentBundleLifecyclePlan(remove)).toMatchObject({ status: 'interrupted' });
    expect(() => materializeCodexAgentBundleLifecyclePlan(remove)).toThrow('incomplete');
    repairCodexAgentBundleLifecyclePlan(remove);
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(join(project, '.codex/agents/alpha.toml'))).toBe(false);
  });

  test('repairs a simulated hard exit after removal deleted its receipt and definitions', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const planned = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    const journalPath = join(project, '.codex/agents/.agentforge/.agentforge-lifecycle.lock');
    writeFileSync(
      journalPath,
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v1',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        after: planned.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: planned.removals,
      })}\n`,
    );
    // Inject the durable final filesystem state but leave the journal, as an
    // abrupt exit would between final publication and journal cleanup.
    materializeCompilationOutputChanges(planned.plan, join(project, '.codex'), planned.removals);
    const interrupted = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(interrupted).toMatchObject({ status: 'interrupted' });
    repairCodexAgentBundleLifecyclePlan(interrupted);
    expect(existsSync(journalPath)).toBe(false);
  });

  test('refuses a tampered journal that tries to overwrite an unrelated sibling role', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const planned = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    const sibling = join(project, '.codex/agents/sibling.toml');
    writeFileSync(sibling, 'name = "sibling"\n');
    writeFileSync(
      join(project, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v1',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        after: [
          ...planned.plan.outputs
            .filter((output) => output.kind === 'generated')
            .map(({ destination, content }) => ({ destination, content })),
          {
            destination: 'agents/sibling.toml',
            content:
              'name = "demo-roles:sibling"\ndescription = "forged"\ndeveloper_instructions = "forged"\n',
          },
        ],
        removals: planned.removals,
      })}\n`,
    );
    const interrupted = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interrupted)).toThrow('invalid');
    expect(readFileSync(sibling, 'utf8')).toBe('name = "sibling"\n');
  });

  test('repairs a user-scope update interrupted after definitions and config but before its receipt', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const codexHome = join(temporaryRoot, 'codex-home');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'user',
        projectRoot: project,
        codexHomeDirectory: codexHome,
      }),
    );
    const alphaPath = join(bundleRoot, 'agents/alpha.toml');
    const alpha = readFileSync(alphaPath, 'utf8').replace(
      'Explicit Codex model',
      'Interrupted update',
    );
    writeFileSync(alphaPath, alpha);
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.package.version = '2.4.0';
    index.agents[0].sha256 = createHash('sha256').update(alpha).digest('hex');
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const planned = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    const lock = join(codexHome, 'agents/.agentforge/.agentforge-lifecycle.lock');
    writeFileSync(
      lock,
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v1',
        operation: 'update',
        owner: { packageId: 'demo-roles' },
        scope: 'user',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        after: planned.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: planned.removals,
      })}\n`,
    );
    materializeCompilationOutputChanges(
      {
        ...planned.plan,
        outputs: planned.plan.outputs.filter((output) => !output.destination.endsWith('.json')),
      },
      codexHome,
      planned.removals,
    );
    const interrupted = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    const installedAlpha = join(codexHome, 'agents/alpha.toml');
    writeFileSync(installedAlpha, 'name = "ambiguous"\n');
    expect(() => materializeCodexAgentBundleLifecyclePlan(interrupted)).toThrow('incomplete');
    expect(() => repairCodexAgentBundleLifecyclePlan(interrupted)).toThrow('inspect');
    expect(readFileSync(installedAlpha, 'utf8')).toBe('name = "ambiguous"\n');
    expect(existsSync(lock)).toBe(true);
    const expectedAlpha = planned.plan.outputs.find(
      (output) => output.destination === 'agents/alpha.toml',
    );
    if (!expectedAlpha || expectedAlpha.kind !== 'generated')
      throw new Error('missing alpha output');
    writeFileSync(installedAlpha, expectedAlpha.content);
    repairCodexAgentBundleLifecyclePlan(interrupted);
    expect(
      JSON.parse(readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8')),
    ).toMatchObject({ owner: { packageVersion: '2.4.0' } });
    expect(existsSync(lock)).toBe(false);
  });

  test('reports missing, current, and conflicted bundle state through the read-only CLI', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const missing = runCli(
      {},
      'check-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toContain('missing:');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const current = runCli(
      {},
      'check-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(current.exitCode).toBe(0);
    expect(current.stdout).toContain('current:');
    const receiptPath = join(project, '.codex/agents/.agentforge/demo-roles.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    receipt.owner.packageVersion = 'foreign';
    writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
    const conflicted = runCli(
      {},
      'check-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(conflicted.exitCode).toBe(1);
    expect(conflicted.stdout).toContain('conflicted:');
    receipt.schema = 'agentforge.codex-agent-receipt/v2';
    receipt.owner.packageVersion = '2.3.4';
    writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
    const priorSchema = runCli(
      {},
      'check-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(priorSchema.exitCode).toBe(1);
    expect(priorSchema.stdout).toContain('unsupported:');
    writeFileSync(receiptPath, '{}\n');
    const unsupported = runCli(
      {},
      'check-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(unsupported.exitCode).toBe(1);
    expect(unsupported.stdout).toContain('unsupported:');
    expect(unsupported.stderr).toContain('.agentforge/demo-roles.json');
  });

  test('reports partial definitions and registrations as missing but refuses to repair them', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    rmSync(join(project, '.codex/agents/alpha.toml'));
    const missingDefinition = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(missingDefinition)).toMatchObject({
      status: 'missing',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: join(project, '.codex/agents/alpha.toml') }),
      ]),
    });
    expect(() => materializeCodexAgentBundleInstallPlan(missingDefinition)).toThrow(
      'managed definition is missing',
    );
    expect(existsSync(join(project, '.codex/agents/alpha.toml'))).toBe(false);

    writeFileSync(
      join(project, '.codex/agents/alpha.toml'),
      readFileSync(join(bundleRoot, 'agents/alpha.toml'), 'utf8'),
    );
    writeFileSync(join(project, '.codex/config.toml'), 'model = "kept"\n');
    const missingRegistration = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(missingRegistration)).toMatchObject({
      status: 'missing',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: join(project, '.codex/config.toml') }),
      ]),
    });
    expect(() => materializeCodexAgentBundleInstallPlan(missingRegistration)).toThrow(
      'role registration is missing',
    );
    expect(readFileSync(join(project, '.codex/config.toml'), 'utf8')).toBe('model = "kept"\n');
  });

  test('rejects a symlinked empty agents root before preview or installation writes', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const outside = join(temporaryRoot, 'outside-agents');
    mkdirSync(join(project, '.codex'), { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(project, '.codex/agents'));
    const preview = runCli(
      {},
      'preview-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    const install = runCli(
      {},
      'install-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(preview.exitCode).toBe(1);
    expect(install.exitCode).toBe(1);
    expect(preview.stderr).toContain('managed output parent must be a real directory');
    expect(install.stderr).toContain('managed output parent must be a real directory');
    expect(existsSync(join(project, '.codex/config.toml'))).toBe(false);
    expect(existsSync(join(outside, 'alpha.toml'))).toBe(false);
  });

  test('reports edited role registrations and unowned definition symlinks before writing', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const configPath = join(project, '.codex/config.toml');
    const editedConfig = readFileSync(configPath, 'utf8').replace(
      /description = .*$/m,
      'description = "user edited registration"',
    );
    writeFileSync(configPath, editedConfig);
    const editedRegistration = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(editedRegistration)).toMatchObject({
      status: 'edited',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: configPath, status: 'edited' }),
      ]),
    });
    expect(() => materializeCodexAgentBundleInstallPlan(editedRegistration)).toThrow(
      'managed role registration differs',
    );
    expect(readFileSync(configPath, 'utf8')).toBe(editedConfig);

    const unownedProject = join(temporaryRoot, 'unowned-project');
    const outside = join(temporaryRoot, 'outside-definition.toml');
    mkdirSync(join(unownedProject, '.codex/agents'), { recursive: true });
    writeFileSync(outside, 'name = "outside"\n');
    const alphaPath = join(unownedProject, '.codex/agents/alpha.toml');
    symlinkSync(outside, alphaPath);
    const unowned = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: unownedProject,
    });
    expect(checkCodexAgentBundleInstallPlan(unowned)).toMatchObject({
      status: 'unsupported',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: alphaPath, status: 'unsupported' }),
      ]),
    });
    expect(() => materializeCodexAgentBundleInstallPlan(unowned)).toThrow(
      'managed definition must be a regular file',
    );
    expect(readFileSync(outside, 'utf8')).toBe('name = "outside"\n');
  });

  test('rejects a newer schema before writing', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.schema = 'agentforge.codex-agent-bundle/v999';
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
    const project = join(temporaryRoot, 'project');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('bundle index is invalid');
    expect(() => readFileSync(join(project, '.codex/config.toml'))).toThrow();
  });

  test('rejects execution provenance that disagrees with digest-valid TOML before writing', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.agents[0].execution.model = { source: 'inherited' };
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
    const project = join(temporaryRoot, 'project');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('execution.model does not match definition');
    expect(() => readFileSync(join(project, '.codex/config.toml'))).toThrow();
  });

  test('rejects a digest mismatch and a foreign definition before writing', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    writeFileSync(join(bundleRoot, 'agents/alpha.toml'), 'name = "demo-roles:alpha"\n');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('bundle definition digest does not match');
    expect(() => readFileSync(join(project, '.codex/config.toml'))).toThrow();

    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    mkdirSync(join(project, '.codex/agents'), { recursive: true });
    writeFileSync(join(project, '.codex/agents/alpha.toml'), 'foreign\n');
    const install = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(() => materializeCodexAgentBundleInstallPlan(install)).toThrow(
      'refusing bundle collision',
    );
  });

  test('continues to consume a JUN-439 v1 standalone bundle', () => {
    const bundleRoot = join(temporaryRoot, 'legacy');
    compileCodexAgentBundle({
      sourceDir: LEGACY_FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(readFileSync(join(project, '.codex/agents/dispatch-probe.toml'), 'utf8')).toContain(
      'agentforge:dispatch-probe',
    );
  });

  test('keeps the JUN-439 user-scope CLI preview and CODEX_HOME installation path', () => {
    const bundleRoot = join(temporaryRoot, 'legacy');
    compileCodexAgentBundle({
      sourceDir: LEGACY_FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const codexHome = join(temporaryRoot, 'codex-home');
    const preview = runCli(
      { CODEX_HOME: codexHome },
      'preview-codex-agent',
      bundleRoot,
      '--scope',
      'user',
    );
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain(join(codexHome, 'agents/dispatch-probe.toml'));
    expect(existsSync(codexHome)).toBe(false);
    const installed = runCli(
      { CODEX_HOME: codexHome },
      'install-codex-agent',
      bundleRoot,
      '--scope',
      'user',
    );
    expect(installed.exitCode).toBe(0);
    expect(readFileSync(join(codexHome, 'agents/dispatch-probe.toml'), 'utf8')).toContain(
      'agentforge:dispatch-probe',
    );
  });

  test('keeps v1 config-table and identity rejections before writing', () => {
    const bundleRoot = join(temporaryRoot, 'legacy');
    compileCodexAgentBundle({
      sourceDir: LEGACY_FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const project = join(temporaryRoot, 'project');
    const configPath = join(project, '.codex/config.toml');
    mkdirSync(join(project, '.codex'), { recursive: true });
    const original = 'agents = { sibling = { config_file = "agents/sibling.toml" } }\n';
    writeFileSync(configPath, original);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('uses an inline agents table');
    expect(readFileSync(configPath, 'utf8')).toBe(original);

    rmSync(join(project, '.codex'), { recursive: true, force: true });
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.agent.name = 'wrong:dispatch-probe';
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('agent name must match package and canonical agent identities');
    expect(existsSync(join(project, '.codex/config.toml'))).toBe(false);
  });

  test('keeps v1 TOML registration escaping and compile diagnostics', () => {
    const source = join(temporaryRoot, 'del');
    mkdirSync(source);
    writeFileSync(
      join(source, 'AGENT.md'),
      '---\nname: del\ndescription: "DEL \\x7f description"\neffort: high\n---\n\nReturn DEL.\n',
    );
    const bundleRoot = join(temporaryRoot, 'legacy');
    compileCodexAgentBundle({ sourceDir: source, packageId: 'agentforge', outputRoot: bundleRoot });
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(readFileSync(join(project, '.codex/config.toml'), 'utf8')).toContain(
      'description = "DEL \\u007f description"',
    );

    const diagnostics = runCli(
      {},
      'compile-codex-agent',
      CLAUDE_FIELDS_FIXTURE,
      '--package-id',
      'agentforge',
      '--out',
      join(temporaryRoot, 'diagnostic'),
    );
    expect(diagnostics.exitCode).toBe(0);
    expect(diagnostics.stdout).toContain('claude-only-frontmatter-stripped');
  });
});

function runCli(env: Record<string, string>, ...args: string[]) {
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

function runSetupScript(script: string, env: Record<string, string>, ...args: string[]) {
  const result = Bun.spawnSync({
    cmd: ['sh', script, ...args],
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
