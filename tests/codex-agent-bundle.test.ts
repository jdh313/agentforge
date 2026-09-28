import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCompilationSnapshot } from 'agentforge/check';
import {
  buildCodexAgentBundleInstallPlan,
  CODEX_AGENT_BUNDLE_INDEX,
  compileCodexAgentBundle,
  materializeCodexAgentBundleInstallPlan,
} from 'agentforge/codex-agent-bundle';
import { compileMarketplace } from 'agentforge/compiler';
import { loadMarketplaceDefinition } from 'agentforge/definitions';
import { materializeCompilation } from 'agentforge/materializer';
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
    expect(one.diagnostics.map(({ message }) => message).join('\n')).toContain(
      'stripped tools, disallowedTools, permissionMode',
    );
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
