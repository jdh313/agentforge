import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCodexAgentBundleInstallPlan,
  CODEX_AGENT_BUNDLE_INDEX,
  compileCodexAgentBundle,
  materializeCodexAgentBundleInstallPlan,
} from 'agentforge/codex-agent-bundle';

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
const FIXTURE = join(import.meta.dir, 'fixtures', 'dispatch-probe');
const CLAUDE_FIELDS_FIXTURE = join(import.meta.dir, 'fixtures', 'agent-claude-fields');
let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-codex-agent-bundle-'));
});

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('compiled Codex agent bundle', () => {
  test('emits a namespaced definition and a versioned digest index', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    const bundle = compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });

    expect(bundle.agentName).toBe('agentforge:dispatch-probe');
    expect(readFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'utf8')).toContain(
      'name = "agentforge:dispatch-probe"',
    );
    expect(readFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'utf8')).toContain(
      'model = "gpt-5.6-terra"',
    );
    expect(readFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'utf8')).toContain(
      'model_reasoning_effort = "high"',
    );
    expect(JSON.parse(readFileSync(join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX), 'utf8'))).toEqual({
      schema: 'agentforge.codex-agent-bundle/v1',
      package: { id: 'agentforge' },
      agent: {
        id: 'dispatch-probe',
        name: 'agentforge:dispatch-probe',
        definition: 'dispatch-probe.toml',
        sha256: bundle.digest,
      },
    });
  });

  test('installs from the bundle after the canonical source disappears and preserves siblings', () => {
    const source = join(temporaryRoot, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'AGENT.md'), readFileSync(join(FIXTURE, 'AGENT.md')));
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({ sourceDir: source, packageId: 'agentforge', outputRoot: bundleRoot });
    rmSync(source, { recursive: true, force: true });

    const projectRoot = join(temporaryRoot, 'project');
    const agents = join(projectRoot, '.codex/agents');
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(projectRoot, '.codex/config.toml'), 'model = "existing-model"\n');
    writeFileSync(join(agents, 'sibling.toml'), 'name = "sibling"\n');
    const install = buildCodexAgentBundleInstallPlan({
      bundleRoot,
      scope: 'project',
      projectRoot,
    });
    materializeCodexAgentBundleInstallPlan(install);

    expect(readFileSync(join(agents, 'dispatch-probe.toml'), 'utf8')).toContain(
      'DISPATCH_PROBE_OK',
    );
    expect(readFileSync(join(agents, 'sibling.toml'), 'utf8')).toBe('name = "sibling"\n');
    expect(
      JSON.parse(readFileSync(join(agents, '.agentforge/agentforge--dispatch-probe.json'), 'utf8')),
    ).toMatchObject({
      owner: { packageId: 'agentforge', agentId: 'dispatch-probe' },
      definition: { name: 'agentforge:dispatch-probe' },
    });
    expect(readFileSync(join(projectRoot, '.codex/config.toml'), 'utf8')).toContain(
      '[agents."agentforge:dispatch-probe"]',
    );
    expect(readFileSync(join(projectRoot, '.codex/config.toml'), 'utf8')).toContain(
      'model = "existing-model"',
    );
  });

  test('uses CODEX_HOME for user scope and preview writes nothing', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({
      sourceDir: FIXTURE,
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

  test('reports nonfatal compilation diagnostics from the bundle command', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    const result = runCli(
      {},
      'compile-codex-agent',
      CLAUDE_FIELDS_FIXTURE,
      '--package-id',
      'agentforge',
      '--out',
      bundleRoot,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'warning [agentforge] claude-only-frontmatter-stripped: Artifact "restricted-reader":',
    );
  });

  test('refuses an inline agents table without changing the destination config', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const projectRoot = join(temporaryRoot, 'project');
    const configPath = join(projectRoot, '.codex/config.toml');
    mkdirSync(join(projectRoot, '.codex'), { recursive: true });
    const original = 'agents = { sibling = { config_file = "agents/sibling.toml" } }\n';
    writeFileSync(configPath, original);

    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('uses an inline agents table');
    expect(readFileSync(configPath, 'utf8')).toBe(original);
    expect(existsSync(join(projectRoot, '.codex/agents/dispatch-probe.toml'))).toBe(false);
  });

  test('serializes a DEL description when registering the role', () => {
    const source = join(temporaryRoot, 'del-description');
    mkdirSync(source);
    writeFileSync(
      join(source, 'AGENT.md'),
      [
        '---',
        'name: del-description',
        'description: "A DEL \\x7f survives TOML serialization."',
        'effort: high',
        '---',
        '',
        '# DEL description',
        '',
        'Return `DEL_OK`.',
        '',
      ].join('\n'),
    );
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({ sourceDir: source, packageId: 'agentforge', outputRoot: bundleRoot });
    const projectRoot = join(temporaryRoot, 'project');
    materializeCodexAgentBundleInstallPlan(
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    );

    const config = readFileSync(join(projectRoot, '.codex/config.toml'), 'utf8');
    expect(config).toContain('description = "A DEL \\u007f survives TOML serialization."');
    expect(() => Bun.TOML.parse(config)).not.toThrow();
  });

  test('preview and install refuse a collision before changing a destination', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const projectRoot = join(temporaryRoot, 'project');
    const agents = join(projectRoot, '.codex/agents');
    mkdirSync(agents, { recursive: true });
    const destination = join(agents, 'dispatch-probe.toml');
    writeFileSync(destination, 'foreign definition\n');
    const preview = runCli(
      {},
      'preview-codex-agent',
      bundleRoot,
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    );
    expect(preview.exitCode).toBe(1);
    expect(preview.stderr).toContain('refusing bundle collision');
    expect(readFileSync(destination, 'utf8')).toBe('foreign definition\n');
    expect(existsSync(join(projectRoot, '.codex/config.toml'))).toBe(false);

    const install = buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot });
    expect(() => materializeCodexAgentBundleInstallPlan(install)).toThrow(
      'refusing bundle collision',
    );
    expect(readFileSync(destination, 'utf8')).toBe('foreign definition\n');
  });

  test('refuses malformed bundle bytes and identity before changing a destination', () => {
    const bundleRoot = join(temporaryRoot, 'bundle');
    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const projectRoot = join(temporaryRoot, 'project');
    const agents = join(projectRoot, '.codex/agents');
    mkdirSync(agents, { recursive: true });
    const destination = join(agents, 'sibling.toml');
    writeFileSync(destination, 'name = "sibling"\n');
    const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);

    writeFileSync(indexPath, '{"schema":"agentforge.codex-agent-bundle/v999"}\n');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('bundle index is invalid');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');

    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.agent.name = 'not-agentforge:dispatch-probe';
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('agent name must match its package and agent identities');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');

    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const definitionIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
    definitionIndex.agent.definition = 'other.toml';
    writeFileSync(indexPath, `${JSON.stringify(definitionIndex)}\n`);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('definition must match its agent identity');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');

    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    writeFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'name = "agentforge:dispatch-probe"\n');
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('bundle definition digest does not match');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');

    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const invalidModel = readFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'utf8').replace(
      'model = "gpt-5.6-terra"',
      'model = 42',
    );
    writeBundleDefinitionWithDigest(bundleRoot, invalidModel);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('unsupported or invalid Codex role fields');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');

    compileCodexAgentBundle({
      sourceDir: FIXTURE,
      packageId: 'agentforge',
      outputRoot: bundleRoot,
    });
    const invalidEffort = readFileSync(join(bundleRoot, 'dispatch-probe.toml'), 'utf8').replace(
      'model_reasoning_effort = "high"',
      'model_reasoning_effort = "banana"',
    );
    writeBundleDefinitionWithDigest(bundleRoot, invalidEffort);
    expect(() =>
      buildCodexAgentBundleInstallPlan({ bundleRoot, scope: 'project', projectRoot }),
    ).toThrow('unsupported or invalid Codex role fields');
    expect(readFileSync(destination, 'utf8')).toBe('name = "sibling"\n');
  });
});

function writeBundleDefinitionWithDigest(bundleRoot: string, content: string): void {
  writeFileSync(join(bundleRoot, 'dispatch-probe.toml'), content);
  const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  index.agent.sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
}

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
