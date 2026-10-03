import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
        { id: 'alpha', name: 'demo-roles:alpha', definition: 'agents/demo-roles/alpha.toml' },
        { id: 'beta', name: 'demo-roles:beta', definition: 'agents/demo-roles/beta.toml' },
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
    expect(readFileSync(join(project, '.codex/agents/demo-roles/alpha.toml'), 'utf8')).toContain(
      'name = "demo-roles:alpha"',
    );
    expect(readFileSync(join(project, '.codex/agents/demo-roles/beta.toml'), 'utf8')).not.toContain(
      'model =',
    );
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
    const alphaPath = join(project, '.codex/agents/demo-roles/alpha.toml');
    const beforeRepeat = statSync(alphaPath);
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const afterRepeat = statSync(alphaPath);
    expect(afterRepeat.ino).toBe(beforeRepeat.ino);
    expect(afterRepeat.mtimeMs).toBe(beforeRepeat.mtimeMs);
  });

  test('installs same-id roles from distinct packages without collisions', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const first = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const second = join(temporaryRoot, 'other-bundle');
    cpSync(first, second, { recursive: true });
    renameSync(join(second, 'agents/demo-roles'), join(second, 'agents/other-roles'));
    const indexPath = join(second, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.package.id = 'other-roles';
    for (const agent of index.agents) {
      const path = join(second, agent.definition.replace('demo-roles', 'other-roles'));
      const content = readFileSync(path, 'utf8').replaceAll('demo-roles:', 'other-roles:');
      writeFileSync(path, content);
      agent.name = agent.name.replace('demo-roles:', 'other-roles:');
      agent.definition = agent.definition.replace('demo-roles', 'other-roles');
      agent.sha256 = createHash('sha256').update(content).digest('hex');
    }
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const project = join(temporaryRoot, 'project');
    for (const bundleRoot of [first, second]) {
      materializeCodexAgentBundleInstallPlan(
        buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
      );
    }
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(true);
    expect(existsSync(join(project, '.codex/agents/other-roles/alpha.toml'))).toBe(true);
    const config = readFileSync(join(project, '.codex/config.toml'), 'utf8');
    expect(config).toContain('demo-roles:alpha');
    expect(config).toContain('other-roles:alpha');
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
          destination: 'agents/demo-roles/alpha.toml',
          installedSha256: expect.any(String),
        },
      ]),
    );
    const definitionPath = join(codexHome, 'agents/demo-roles/alpha.toml');
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
    writeFileSync(join(codexHome, 'agents/demo-roles/alpha.toml'), 'name = "user-scope-edit"\n');
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

  test('keeps Codex configuration owner-readable only through install, update, and removal', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const configPath = join(project, '.codex/config.toml');
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.package.version = '2.3.5';
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    materializeCodexAgentBundleLifecyclePlan(
      buildCodexAgentBundleUpdatePlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    materializeCodexAgentBundleLifecyclePlan(
      buildCodexAgentBundleRemovePlan({
        packageId: 'demo-roles',
        scope: 'project',
        projectRoot: project,
      }),
    );
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  test('migrates a legacy v3 receipt path to the package-qualified path on update', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    const compiled = compileMarketplace(loaded, allTargets(), { outputRoot: out });
    materializeCompilation(compiled, out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const legacyIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
    for (const agent of legacyIndex.agents) {
      const from = join(bundleRoot, agent.definition);
      const legacy = `agents/${agent.id}.toml`;
      renameSync(from, join(bundleRoot, legacy));
      agent.definition = legacy;
    }
    writeFileSync(indexPath, `${JSON.stringify(legacyIndex, null, 2)}\n`);
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(existsSync(join(project, '.codex/agents/alpha.toml'))).toBe(true);
    materializeCompilation(compiled, out);
    const update = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(previewCodexAgentBundleLifecyclePlan(update)).toMatchObject({ status: 'ready' });
    materializeCodexAgentBundleLifecyclePlan(update);
    expect(existsSync(join(project, '.codex/agents/alpha.toml'))).toBe(false);
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(true);
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
    const alphaPath = join(bundleRoot, 'agents/demo-roles/alpha.toml');
    const gammaPath = join(bundleRoot, 'agents/demo-roles/gamma.toml');
    const alpha = readFileSync(alphaPath, 'utf8').replace(
      'Explicit Codex model',
      'Updated explicit Codex model',
    );
    const gamma = readFileSync(join(bundleRoot, 'agents/demo-roles/beta.toml'), 'utf8').replace(
      'demo-roles:beta',
      'demo-roles:gamma',
    );
    writeFileSync(alphaPath, alpha);
    writeFileSync(gammaPath, gamma);
    rmSync(join(bundleRoot, 'agents/demo-roles/beta.toml'));
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
      definition: 'agents/demo-roles/gamma.toml',
      sha256: createHash('sha256').update(gamma).digest('hex'),
    });
    index.agents.sort((left: { id: string }, right: { id: string }) =>
      left.id.localeCompare(right.id),
    );
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    for (const context of contexts) {
      const update = buildCodexAgentBundleUpdatePlan({ bundleRoot, ...context });
      materializeCodexAgentBundleLifecyclePlan(update);
      expect(readFileSync(join(context.root, 'agents/demo-roles/alpha.toml'), 'utf8')).toContain(
        'Updated explicit Codex model',
      );
      expect(existsSync(join(context.root, 'agents/demo-roles/gamma.toml'))).toBe(true);
      expect(existsSync(join(context.root, 'agents/demo-roles/beta.toml'))).toBe(false);
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
    const gamma = readFileSync(join(bundleRoot, 'agents/demo-roles/beta.toml'), 'utf8').replace(
      'demo-roles:beta',
      'demo-roles:gamma',
    );
    writeFileSync(join(bundleRoot, 'agents/demo-roles/gamma.toml'), gamma);
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const beta = index.agents.find((agent: { id: string }) => agent.id === 'beta');
    index.agents.push({
      ...beta,
      id: 'gamma',
      name: 'demo-roles:gamma',
      definition: 'agents/demo-roles/gamma.toml',
      sha256: createHash('sha256').update(gamma).digest('hex'),
    });
    index.agents.sort((left: { id: string }, right: { id: string }) =>
      left.id.localeCompare(right.id),
    );
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const gammaDestination = join(project, '.codex/agents/demo-roles/gamma.toml');
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
      `${readFileSync(join(project, '.codex/config.toml'), 'utf8')}\n[agents."demo-roles:gamma"]\nconfig_file = "agents/demo-roles/gamma.toml"\ndescription = "foreign"\n`,
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
    writeFileSync(join(codexHome, 'agents/demo-roles/alpha.toml'), 'name = "edited"\n');
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    expect(previewCodexAgentBundleLifecyclePlan(remove).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'preserve',
          path: join(codexHome, 'agents/demo-roles/alpha.toml'),
        }),
      ]),
    );
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(readFileSync(join(codexHome, 'agents/demo-roles/alpha.toml'), 'utf8')).toBe(
      'name = "edited"\n',
    );
    expect(existsSync(join(codexHome, 'agents/demo-roles/beta.toml'))).toBe(false);
    expect(existsSync(join(project, '.codex/agents/demo-roles/beta.toml'))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(codexHome, 'agents/.agentforge/demo-roles.json'), 'utf8'))
        .agents,
    ).toHaveLength(1);
  });

  test('removes a semantically current registration with user formatting', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const configPath = join(project, '.codex/config.toml');
    const config = readFileSync(configPath, 'utf8').replace(
      /\[agents\."demo-roles:alpha"\]\nconfig_file = (.+)\ndescription = (.+)\n/,
      '[ agents . "demo-roles:alpha" ]\n# formatted by user\ndescription = $2\nconfig_file = $1\n',
    );
    writeFileSync(configPath, config);
    const current = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(current)).toMatchObject({ status: 'current' });
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(previewCodexAgentBundleLifecyclePlan(remove)).toMatchObject({ status: 'ready' });
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(readFileSync(configPath, 'utf8')).not.toContain('demo-roles:alpha');
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(false);
  });

  test('preserves a registration and role when the user adds a table field', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    const configPath = join(project, '.codex/config.toml');
    writeFileSync(
      configPath,
      readFileSync(configPath, 'utf8').replace(
        'description = "Explicit Codex model and retained policy loss fixture."',
        'description = "Explicit Codex model and retained policy loss fixture."\ncustom = "keep"',
      ),
    );
    const check = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(check)).toMatchObject({ status: 'edited' });
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(previewCodexAgentBundleLifecyclePlan(remove).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'preserve',
          path: join(project, '.codex/agents/demo-roles/alpha.toml'),
        }),
      ]),
    );
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(readFileSync(configPath, 'utf8')).toContain('custom = "keep"');
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(true);
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
    rmSync(join(codexHome, 'agents/demo-roles/beta.toml'));
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    expect(remove.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'remove',
          path: join(codexHome, 'agents/demo-roles/alpha.toml'),
        }),
        expect.objectContaining({
          kind: 'preserve',
          path: join(codexHome, 'agents/demo-roles/beta.toml'),
        }),
      ]),
    );
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(existsSync(join(codexHome, 'agents/demo-roles/alpha.toml'))).toBe(false);
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
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        unresolved: planned.unresolved,
        absent: planned.absences,
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
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(false);
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
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        unresolved: planned.unresolved,
        absent: planned.absences,
        after: planned.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: planned.removals,
      })}\n`,
    );
    // Inject the durable final filesystem state but leave the journal, as an
    // abrupt exit would between final publication and journal cleanup.
    materializeCompilationOutputChanges(planned.plan, join(project, '.codex'), planned.removals, {
      privateDestinations: ['config.toml'],
    });
    const interrupted = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: project,
    });
    expect(interrupted).toMatchObject({ status: 'interrupted' });
    repairCodexAgentBundleLifecyclePlan(interrupted);
    expect(existsSync(journalPath)).toBe(false);
    expect(statSync(join(project, '.codex/config.toml')).mode & 0o777).toBe(0o600);
  });

  test('refuses a tampered journal that writes an unclassified path', async () => {
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
    const auth = join(project, '.codex/auth.json');
    writeFileSync(auth, '{"token":"keep"}\n');
    writeFileSync(
      join(project, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        unresolved: planned.unresolved,
        absent: planned.absences,
        after: [
          ...planned.plan.outputs
            .filter((output) => output.kind === 'generated')
            .map(({ destination, content }) => ({ destination, content })),
          {
            destination: 'auth.json',
            content: '{"token":"forged"}\n',
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
    expect(readFileSync(auth, 'utf8')).toBe('{"token":"keep"}\n');
  });

  test('refuses journal repairs that forge config, remove retained roles, or overwrite new role paths', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const journal = (planned: ReturnType<typeof buildCodexAgentBundleRemovePlan>) => ({
      schema: 'agentforge.codex-agent-lifecycle-journal/v4',
      operation: planned.operation,
      owner: { packageId: 'demo-roles' },
      scope: planned.scope,
      before: planned.preconditions,
      receipt: planned.receiptContent,
      unresolved: planned.unresolved,
      absent: planned.absences,
      after: planned.plan.outputs
        .filter((output) => output.kind === 'generated')
        .map(({ destination, content }) => ({ destination, content })),
      removals: planned.removals,
    });

    const configProject = join(temporaryRoot, 'forged-config');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'project',
        projectRoot: configProject,
      }),
    );
    const configPlan = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: configProject,
    });
    const forgedConfig = journal(configPlan);
    const config = forgedConfig.after.find((output) => output.destination === 'config.toml');
    if (!config) throw new Error('missing planned config');
    config.content = `${config.content}model = "forged"\n`;
    const configPath = join(configProject, '.codex/config.toml');
    const originalConfig = readFileSync(configPath, 'utf8');
    writeFileSync(
      join(configProject, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify(forgedConfig)}\n`,
    );
    const interruptedConfig = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: configProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedConfig)).toThrow('invalid');
    expect(readFileSync(configPath, 'utf8')).toBe(originalConfig);

    const retainedProject = join(temporaryRoot, 'retained-role');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'project',
        projectRoot: retainedProject,
      }),
    );
    const retainedPath = join(retainedProject, '.codex/agents/demo-roles/beta.toml');
    const retainedConfigPath = join(retainedProject, '.codex/config.toml');
    writeFileSync(
      retainedConfigPath,
      readFileSync(retainedConfigPath, 'utf8').replace(
        'description = "Inherits the caller model because no Codex model is declared."',
        'description = "Inherits the caller model because no Codex model is declared."\ncustom = "keep"',
      ),
    );
    const retainedPlan = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: retainedProject,
    });
    const forgedOwner = journal(retainedPlan);
    const retainedReceipt = forgedOwner.after.find((output) =>
      output.destination.endsWith('.json'),
    );
    if (!retainedReceipt) throw new Error('missing retained ownership receipt');
    const retainedDocument = JSON.parse(retainedReceipt.content);
    retainedDocument.owner.packageVersion = 'forged';
    retainedReceipt.content = `${JSON.stringify(retainedDocument, null, 2)}\n`;
    const retainedLock = join(
      retainedProject,
      '.codex/agents/.agentforge/.agentforge-lifecycle.lock',
    );
    writeFileSync(retainedLock, `${JSON.stringify(forgedOwner)}\n`);
    const interruptedOwner = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: retainedProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedOwner)).toThrow('invalid');
    const retainedContent = readFileSync(retainedPath, 'utf8');
    const forgedRemoval = {
      ...journal(retainedPlan),
      before: [
        ...retainedPlan.preconditions,
        {
          destination: 'agents/demo-roles/beta.toml',
          sha256: createHash('sha256').update(retainedContent).digest('hex'),
          content: retainedContent,
        },
      ],
      removals: [...retainedPlan.removals, 'agents/demo-roles/beta.toml'],
    };
    writeFileSync(retainedLock, `${JSON.stringify(forgedRemoval)}\n`);
    const interruptedRemoval = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: retainedProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedRemoval)).toThrow('invalid');
    expect(readFileSync(retainedPath, 'utf8')).toBe(retainedContent);
    expect(readFileSync(retainedConfigPath, 'utf8')).toContain('custom = "keep"');

    const updateProject = join(temporaryRoot, 'unreceipted-role');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'project',
        projectRoot: updateProject,
      }),
    );
    const update = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: updateProject,
    });
    const injectedContent =
      'name = "demo-roles:injected"\ndescription = "forged"\ndeveloper_instructions = "forged"\n';
    const forgedUpdate = {
      ...journal(update as ReturnType<typeof buildCodexAgentBundleRemovePlan>),
      operation: 'update',
      after: [
        ...update.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        {
          destination: 'agents/demo-roles/injected.toml',
          content: injectedContent,
        },
      ],
      removals: update.removals,
      receipt: update.receiptContent,
      before: update.preconditions,
      scope: update.scope,
    };
    const forgedReceipt = forgedUpdate.after.find((output) => output.destination.endsWith('.json'));
    const forgedUpdateConfig = forgedUpdate.after.find(
      (output) => output.destination === 'config.toml',
    );
    if (!forgedReceipt || !forgedUpdateConfig) throw new Error('missing planned ownership outputs');
    const nextReceipt = JSON.parse(forgedReceipt.content);
    nextReceipt.agents.push({
      id: 'injected',
      name: 'demo-roles:injected',
      destination: 'agents/demo-roles/injected.toml',
      installedSha256: createHash('sha256').update(injectedContent).digest('hex'),
    });
    forgedReceipt.content = `${JSON.stringify(nextReceipt, null, 2)}\n`;
    forgedUpdateConfig.content +=
      '[agents."demo-roles:injected"]\nconfig_file = "agents/demo-roles/injected.toml"\ndescription = "forged"\n';
    const foreignDefinition = join(updateProject, '.codex/agents/demo-roles/injected.toml');
    writeFileSync(foreignDefinition, 'name = "foreign"\n');
    writeFileSync(
      join(updateProject, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify(forgedUpdate)}\n`,
    );
    const interruptedUpdate = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: updateProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedUpdate)).toThrow('invalid');
    expect(readFileSync(foreignDefinition, 'utf8')).toBe('name = "foreign"\n');
  });

  test('refuses journals that omit prior update bindings or required removals', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');

    const updateProject = join(temporaryRoot, 'missing-before');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'project',
        projectRoot: updateProject,
      }),
    );
    const update = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: updateProject,
    });
    const after = update.plan.outputs
      .filter((output) => output.kind === 'generated')
      .map(({ destination, content }) => ({ destination, content }));
    const alpha = after.find((output) => output.destination.endsWith('/alpha.toml'));
    const receipt = after.find((output) => output.destination.endsWith('.json'));
    if (!alpha || !receipt) throw new Error('missing planned update outputs');
    alpha.content = alpha.content.replace('Return ALPHA.', 'Return FORGED.');
    const nextReceipt = JSON.parse(receipt.content);
    const alphaReceipt = nextReceipt.agents.find((agent: { id: string }) => agent.id === 'alpha');
    if (!alphaReceipt) throw new Error('missing planned alpha receipt');
    alphaReceipt.installedSha256 = createHash('sha256').update(alpha.content).digest('hex');
    receipt.content = `${JSON.stringify(nextReceipt, null, 2)}\n`;
    const installedAlpha = join(updateProject, '.codex/agents/demo-roles/alpha.toml');
    const originalAlpha = readFileSync(installedAlpha, 'utf8');
    writeFileSync(
      join(updateProject, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'update',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: update.preconditions.filter(
          ({ destination }) => destination !== 'agents/demo-roles/alpha.toml',
        ),
        receipt: update.receiptContent,
        unresolved: update.unresolved,
        absent: update.absences,
        after,
        removals: update.removals,
      })}\n`,
    );
    const interruptedUpdate = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'project',
      projectRoot: updateProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedUpdate)).toThrow('invalid');
    expect(readFileSync(installedAlpha, 'utf8')).toBe(originalAlpha);

    const removeProject = join(temporaryRoot, 'missing-removals');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({
        bundleRoot,
        scope: 'project',
        projectRoot: removeProject,
      }),
    );
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: removeProject,
    });
    const removeAlpha = join(removeProject, '.codex/agents/demo-roles/alpha.toml');
    const removeConfig = join(removeProject, '.codex/config.toml');
    const originalRemoveConfig = readFileSync(removeConfig, 'utf8');
    writeFileSync(
      join(removeProject, '.codex/agents/.agentforge/.agentforge-lifecycle.lock'),
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'project',
        before: remove.preconditions,
        receipt: remove.receiptContent,
        unresolved: remove.unresolved,
        absent: remove.absences,
        after: remove.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: [],
      })}\n`,
    );
    const interruptedRemove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'project',
      projectRoot: removeProject,
    });
    expect(() => repairCodexAgentBundleLifecyclePlan(interruptedRemove)).toThrow('invalid');
    expect(existsSync(removeAlpha)).toBe(true);
    expect(readFileSync(removeConfig, 'utf8')).toBe(originalRemoveConfig);
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
    const alphaPath = join(bundleRoot, 'agents/demo-roles/alpha.toml');
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
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'update',
        owner: { packageId: 'demo-roles' },
        scope: 'user',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        unresolved: planned.unresolved,
        absent: planned.absences,
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
      { privateDestinations: ['config.toml'] },
    );
    const interrupted = buildCodexAgentBundleUpdatePlan({
      bundleRoot,
      scope: 'user',
      projectRoot: project,
      codexHomeDirectory: codexHome,
    });
    const installedAlpha = join(codexHome, 'agents/demo-roles/alpha.toml');
    writeFileSync(installedAlpha, 'name = "ambiguous"\n');
    expect(() => materializeCodexAgentBundleLifecyclePlan(interrupted)).toThrow('incomplete');
    expect(() => repairCodexAgentBundleLifecyclePlan(interrupted)).toThrow('inspect');
    expect(readFileSync(installedAlpha, 'utf8')).toBe('name = "ambiguous"\n');
    expect(existsSync(lock)).toBe(true);
    const expectedAlpha = planned.plan.outputs.find(
      (output) => output.destination === 'agents/demo-roles/alpha.toml',
    );
    if (!expectedAlpha || expectedAlpha.kind !== 'generated')
      throw new Error('missing alpha output');
    writeFileSync(installedAlpha, expectedAlpha.content);
    repairCodexAgentBundleLifecyclePlan(interrupted);
    expect(statSync(join(codexHome, 'config.toml')).mode & 0o777).toBe(0o600);
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
    rmSync(join(project, '.codex/agents/demo-roles/alpha.toml'));
    const missingDefinition = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot: project,
    });
    expect(checkCodexAgentBundleInstallPlan(missingDefinition)).toMatchObject({
      status: 'missing',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: join(project, '.codex/agents/demo-roles/alpha.toml') }),
      ]),
    });
    expect(() => materializeCodexAgentBundleInstallPlan(missingDefinition)).toThrow(
      'managed definition is missing',
    );
    expect(existsSync(join(project, '.codex/agents/demo-roles/alpha.toml'))).toBe(false);

    writeFileSync(
      join(project, '.codex/agents/demo-roles/alpha.toml'),
      readFileSync(join(bundleRoot, 'agents/demo-roles/alpha.toml'), 'utf8'),
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

  test('installs through a symlinked empty agents root and leaves the link in place', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const outside = join(temporaryRoot, 'outside-agents');
    mkdirSync(join(project, '.codex'), { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(project, '.codex/agents'));
    const args = ['--scope', 'project', '--project-root', project];
    const preview = runCli({}, 'preview-codex-agent', bundleRoot, ...args);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain(
      `agents: ${join(project, '.codex/agents')} -> ${realpathSync(outside)}`,
    );
    const install = runCli({}, 'install-codex-agent', bundleRoot, ...args);
    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain(
      `agents: ${join(project, '.codex/agents')} -> ${realpathSync(outside)}`,
    );
    expect(lstatSync(join(project, '.codex/agents')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(outside, 'demo-roles/alpha.toml'))).toBe(true);
    expect(existsSync(join(outside, '.agentforge/demo-roles.json'))).toBe(true);
    expect(existsSync(join(project, '.codex/config.toml'))).toBe(true);
    const check = runCli({}, 'check-codex-agent', bundleRoot, ...args);
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain('current:');
  });

  test('rejects install preview while a lifecycle journal locks the scope', async () => {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    const bundleRoot = join(out, 'packages/demo/.agentforge/codex-agent-bundle');
    const project = join(temporaryRoot, 'project');
    const lock = join(project, '.codex/agents/.agentforge/.agentforge-lifecycle.lock');
    mkdirSync(join(project, '.codex/agents/.agentforge'), { recursive: true });
    writeFileSync(lock, '{"schema":"agentforge.codex-agent-lifecycle-journal/v4"}\n');
    const preview = runCli(
      {},
      'preview-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      project,
    );
    expect(preview.exitCode).toBe(1);
    expect(preview.stderr).toContain('incomplete lifecycle operation');
    expect(existsSync(lock)).toBe(true);
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
    mkdirSync(join(unownedProject, '.codex/agents/demo-roles'), { recursive: true });
    writeFileSync(outside, 'name = "outside"\n');
    const alphaPath = join(unownedProject, '.codex/agents/demo-roles/alpha.toml');
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
    writeFileSync(join(bundleRoot, 'agents/demo-roles/alpha.toml'), 'name = "demo-roles:alpha"\n');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    ).toThrow('bundle definition digest does not match');
    expect(() => readFileSync(join(project, '.codex/config.toml'))).toThrow();

    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    mkdirSync(join(project, '.codex/agents/demo-roles'), { recursive: true });
    writeFileSync(join(project, '.codex/agents/demo-roles/alpha.toml'), 'foreign\n');
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

describe('symlinked Codex scope anchors', () => {
  async function compiledBundle(): Promise<string> {
    const loaded = await loadMarketplaceDefinition(join(FIXTURE, 'MARKETPLACE.yaml'));
    const out = join(temporaryRoot, 'compiled');
    materializeCompilation(compileMarketplace(loaded, allTargets(), { outputRoot: out }), out);
    return join(out, 'packages/demo/.agentforge/codex-agent-bundle');
  }

  /** Mimic home-manager: scope link -> store-style link -> dotfiles target. */
  function linkScope(scopeRoot: string, dotfiles: string) {
    const store = join(temporaryRoot, 'store');
    mkdirSync(scopeRoot, { recursive: true });
    mkdirSync(store, { recursive: true });
    mkdirSync(join(dotfiles, 'agents'), { recursive: true });
    const config = join(dotfiles, 'config.personal.toml');
    writeFileSync(config, 'model = "kept"\n');
    chmodSync(config, 0o600);
    symlinkSync(config, join(store, 'config.toml'));
    symlinkSync(join(dotfiles, 'agents'), join(store, 'agents'));
    symlinkSync(join(store, 'config.toml'), join(scopeRoot, 'config.toml'));
    symlinkSync(join(store, 'agents'), join(scopeRoot, 'agents'));
    return { config: realpathSync(config), agents: realpathSync(join(dotfiles, 'agents')) };
  }

  function userOptions(bundleRoot: string, codexHome: string) {
    return {
      bundleRoot,
      scope: 'user' as const,
      projectRoot: join(temporaryRoot, 'project'),
      codexHomeDirectory: codexHome,
    };
  }

  test('installs, checks, updates, and removes through symlinked anchors', async () => {
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    const dotfiles = join(temporaryRoot, 'dotfiles/codex');
    const target = linkScope(codexHome, dotfiles);
    const options = userOptions(bundleRoot, codexHome);

    const install = buildCodexAgentBundleInstallPlan(options);
    expect(install.anchors).toEqual({
      config: { link: join(codexHome, 'config.toml'), target: target.config },
      agents: { link: join(codexHome, 'agents'), target: target.agents },
    });
    materializeCodexAgentBundleInstallPlan(install);
    expect(lstatSync(join(codexHome, 'config.toml')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(codexHome, 'agents')).isSymbolicLink()).toBe(true);
    const written = readFileSync(target.config, 'utf8');
    expect(written.startsWith('model = "kept"\n')).toBe(true);
    expect(written).toContain('[agents."demo-roles:alpha"]');
    expect(statSync(target.config).mode & 0o777).toBe(0o600);
    expect(existsSync(join(target.agents, 'demo-roles/alpha.toml'))).toBe(true);
    expect(existsSync(join(target.agents, '.agentforge/demo-roles.json'))).toBe(true);
    expect(existsSync(join(target.agents, '.agentforge/.agentforge-lifecycle.lock'))).toBe(false);
    expect(checkCodexAgentBundleInstallPlan(buildCodexAgentBundleInstallPlan(options)).status).toBe(
      'current',
    );
    // No staging or backup siblings are left beside the targets.
    expect(readdirSync(dirname(target.config)).sort()).toEqual(['agents', 'config.personal.toml']);

    const alphaPath = join(bundleRoot, 'agents/demo-roles/alpha.toml');
    const alpha = readFileSync(alphaPath, 'utf8').replace(
      'Explicit Codex model',
      'Updated through links',
    );
    writeFileSync(alphaPath, alpha);
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.package.version = '2.4.0';
    index.agents[0].sha256 = createHash('sha256').update(alpha).digest('hex');
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const update = buildCodexAgentBundleUpdatePlan(options);
    expect(update.anchors.agents?.target).toBe(target.agents);
    materializeCodexAgentBundleLifecyclePlan(update);
    expect(readFileSync(join(target.agents, 'demo-roles/alpha.toml'), 'utf8')).toContain(
      'Updated through links',
    );
    expect(lstatSync(join(codexHome, 'agents')).isSymbolicLink()).toBe(true);
    expect(statSync(target.config).mode & 0o777).toBe(0o600);

    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: options.projectRoot,
      codexHomeDirectory: codexHome,
    });
    expect(remove.status).toBe('ready');
    materializeCodexAgentBundleLifecyclePlan(remove);
    expect(lstatSync(join(codexHome, 'config.toml')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(codexHome, 'agents')).isSymbolicLink()).toBe(true);
    expect(readFileSync(target.config, 'utf8')).toBe('model = "kept"\n');
    expect(existsSync(join(target.agents, 'demo-roles/alpha.toml'))).toBe(false);
    expect(existsSync(join(target.agents, '.agentforge/demo-roles.json'))).toBe(false);
  });

  test('repairs an interrupted lifecycle journal that lives behind the agents link', async () => {
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    const target = linkScope(codexHome, join(temporaryRoot, 'dotfiles/codex'));
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome)),
    );
    const removeOptions = {
      packageId: 'demo-roles',
      scope: 'user' as const,
      projectRoot: join(temporaryRoot, 'project'),
      codexHomeDirectory: codexHome,
    };
    const planned = buildCodexAgentBundleRemovePlan(removeOptions);
    const journal = join(target.agents, '.agentforge/.agentforge-lifecycle.lock');
    writeFileSync(
      journal,
      `${JSON.stringify({
        schema: 'agentforge.codex-agent-lifecycle-journal/v4',
        operation: 'remove',
        owner: { packageId: 'demo-roles' },
        scope: 'user',
        before: planned.preconditions,
        receipt: planned.receiptContent,
        unresolved: planned.unresolved,
        absent: planned.absences,
        after: planned.plan.outputs
          .filter((output) => output.kind === 'generated')
          .map(({ destination, content }) => ({ destination, content })),
        removals: planned.removals,
      })}\n`,
    );
    const interrupted = buildCodexAgentBundleRemovePlan(removeOptions);
    expect(interrupted.status).toBe('interrupted');
    expect(() => materializeCodexAgentBundleLifecyclePlan(interrupted)).toThrow('incomplete');
    repairCodexAgentBundleLifecyclePlan(interrupted);
    expect(existsSync(journal)).toBe(false);
    expect(existsSync(join(target.agents, 'demo-roles/alpha.toml'))).toBe(false);
    expect(readFileSync(target.config, 'utf8')).toBe('model = "kept"\n');
    expect(lstatSync(join(codexHome, 'agents')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(codexHome, 'config.toml')).isSymbolicLink()).toBe(true);
  });

  test('refuses a dangling anchor, naming the link', async () => {
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    mkdirSync(codexHome, { recursive: true });
    symlinkSync(join(temporaryRoot, 'missing.toml'), join(codexHome, 'config.toml'));
    expect(() => buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome))).toThrow(
      `symbolic link is dangling: ${join(codexHome, 'config.toml')}`,
    );
    const remove = buildCodexAgentBundleRemovePlan({
      packageId: 'demo-roles',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'project'),
      codexHomeDirectory: codexHome,
    });
    expect(remove.status).toBe('refused');
    expect(() => materializeCodexAgentBundleLifecyclePlan(remove)).toThrow('dangling');
  });

  test('refuses anchors that resolve to the wrong type or mode, naming link and target', async () => {
    const bundleRoot = await compiledBundle();
    const wrongConfig = join(temporaryRoot, 'wrong-config');
    mkdirSync(join(temporaryRoot, 'a-dir'), { recursive: true });
    mkdirSync(wrongConfig, { recursive: true });
    symlinkSync(join(temporaryRoot, 'a-dir'), join(wrongConfig, 'config.toml'));
    expect(() => buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, wrongConfig))).toThrow(
      `must resolve to a regular file: ${join(wrongConfig, 'config.toml')} -> ${realpathSync(join(temporaryRoot, 'a-dir'))}`,
    );

    const wrongAgents = join(temporaryRoot, 'wrong-agents');
    const file = join(temporaryRoot, 'a-file');
    mkdirSync(wrongAgents, { recursive: true });
    writeFileSync(file, 'x');
    symlinkSync(file, join(wrongAgents, 'agents'));
    expect(() => buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, wrongAgents))).toThrow(
      `must resolve to a real directory: ${join(wrongAgents, 'agents')} -> ${realpathSync(file)}`,
    );

    const loose = join(temporaryRoot, 'loose');
    mkdirSync(loose, { recursive: true });
    const looseTarget = join(temporaryRoot, 'loose-target.toml');
    writeFileSync(looseTarget, '');
    chmodSync(looseTarget, 0o644);
    symlinkSync(looseTarget, join(loose, 'config.toml'));
    expect(() => buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, loose))).toThrow(
      'must have mode 0600',
    );
    expect(existsSync(join(loose, 'agents'))).toBe(false);
  });

  test('refuses a read-only target before any write', async () => {
    if (process.getuid?.() === 0) return;
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    const dotfiles = join(temporaryRoot, 'dotfiles/codex');
    const target = linkScope(codexHome, dotfiles);
    chmodSync(dotfiles, 0o555);
    try {
      expect(() => buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome))).toThrow(
        'is not writable',
      );
    } finally {
      chmodSync(dotfiles, 0o755);
    }
    expect(readFileSync(target.config, 'utf8')).toBe('model = "kept"\n');
    expect(readdirSync(target.agents)).toEqual([]);
  });

  test('refuses to write when an anchor is retargeted between plan and materialize', async () => {
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    const target = linkScope(codexHome, join(temporaryRoot, 'dotfiles/codex'));
    const install = buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome));
    const other = join(temporaryRoot, 'other.toml');
    writeFileSync(other, 'model = "other"\n');
    chmodSync(other, 0o600);
    rmSync(join(codexHome, 'config.toml'));
    symlinkSync(other, join(codexHome, 'config.toml'));
    expect(() => materializeCodexAgentBundleInstallPlan(install)).toThrow('no longer resolves');
    expect(readFileSync(other, 'utf8')).toBe('model = "other"\n');
    expect(readFileSync(target.config, 'utf8')).toBe('model = "kept"\n');
    expect(readdirSync(target.agents)).toEqual([]);

    // The materializer re-checks on its own, past the bundle layer's guard.
    expect(() =>
      materializeCompilationOutputChanges(install.plan, codexHome, [], {
        anchors: [
          {
            destination: 'config.toml',
            link: join(codexHome, 'config.toml'),
            target: target.config,
          },
        ],
      }),
    ).toThrow('no longer resolves');
    expect(readdirSync(target.agents)).toEqual([]);
  });

  test('keeps refusing symbolic links at non-anchor paths under an anchored agents directory', async () => {
    const bundleRoot = await compiledBundle();
    const codexHome = join(temporaryRoot, 'codex-home');
    const target = linkScope(codexHome, join(temporaryRoot, 'dotfiles/codex'));
    const elsewhere = join(temporaryRoot, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(target.agents, 'demo-roles'));
    const packageLink = buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome));
    expect(checkCodexAgentBundleInstallPlan(packageLink)).toMatchObject({ status: 'unsupported' });
    expect(() => materializeCodexAgentBundleInstallPlan(packageLink)).toThrow('refusing');
    expect(readdirSync(elsewhere)).toEqual([]);
    rmSync(join(target.agents, 'demo-roles'));

    mkdirSync(join(target.agents, 'demo-roles'));
    const outside = join(temporaryRoot, 'outside-definition.toml');
    writeFileSync(outside, 'name = "outside"\n');
    symlinkSync(outside, join(target.agents, 'demo-roles/alpha.toml'));
    const definitionLink = buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome));
    expect(checkCodexAgentBundleInstallPlan(definitionLink)).toMatchObject({
      status: 'unsupported',
    });
    expect(() => materializeCodexAgentBundleInstallPlan(definitionLink)).toThrow(
      'managed definition must be a regular file',
    );
    expect(readFileSync(outside, 'utf8')).toBe('name = "outside"\n');
    expect(readFileSync(target.config, 'utf8')).toBe('model = "kept"\n');
  });

  test('still refuses a symlinked scope root and a symlinked receipt directory', async () => {
    const bundleRoot = await compiledBundle();
    const real = join(temporaryRoot, 'real-home');
    mkdirSync(real);
    symlinkSync(real, join(temporaryRoot, 'linked-home'));
    expect(() =>
      buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, join(temporaryRoot, 'linked-home'))),
    ).toThrow('must be a real directory');

    const codexHome = join(temporaryRoot, 'codex-home');
    const target = linkScope(codexHome, join(temporaryRoot, 'dotfiles/codex'));
    const receiptDir = join(temporaryRoot, 'receipt-dir');
    mkdirSync(receiptDir);
    symlinkSync(receiptDir, join(target.agents, '.agentforge'));
    const install = buildCodexAgentBundleInstallPlan(userOptions(bundleRoot, codexHome));
    expect(checkCodexAgentBundleInstallPlan(install).status).toBe('unsupported');
    expect(() => materializeCodexAgentBundleInstallPlan(install)).toThrow('refusing');
    expect(readdirSync(receiptDir)).toEqual([]);
  });

  test('installs a project scope through a symlinked agents directory via the library', async () => {
    const bundleRoot = await compiledBundle();
    const project = join(temporaryRoot, 'project');
    const dotfiles = join(temporaryRoot, 'dotfiles/project-codex');
    mkdirSync(join(project, '.codex'), { recursive: true });
    mkdirSync(join(dotfiles, 'agents'), { recursive: true });
    symlinkSync(join(dotfiles, 'agents'), join(project, '.codex/agents'));
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot: project }),
    );
    expect(lstatSync(join(project, '.codex/agents')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(dotfiles, 'agents/demo-roles/beta.toml'))).toBe(true);
    expect(lstatSync(join(project, '.codex/config.toml')).isFile()).toBe(true);
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
