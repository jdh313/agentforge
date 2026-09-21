import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCompilationSnapshot } from 'agentforge/check';
import { buildInstallPlan, checkInstallPlan, materializeInstallPlan } from 'agentforge/install';
import { materializeCompilation } from 'agentforge/materializer';
import { getArtifactConfig } from '../src/targets/index.ts';

let temporaryRoot: string;
const FIXTURE_AGENT = join(import.meta.dir, 'fixtures', 'agent-basic');

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-'));
});

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('scoped artifact installation', () => {
  test('publishes one project skill as an owned snapshot and preserves siblings', () => {
    const source = fixtureSkill();
    const projectRoot = join(temporaryRoot, 'project');
    const sibling = join(projectRoot, '.claude/skills/sibling');
    const destination = join(projectRoot, '.claude/skills/demo');
    mkdirSync(sibling, { recursive: true });
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(sibling, 'SKILL.md'), 'sibling\n');
    writeFileSync(join(destination, 'stale.md'), 'stale\n');

    const install = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'skill',
      scope: 'project',
      projectRoot,
    });
    materializeCompilation(install.plan, install.destinationRoot);

    expect(install.destinationRoot).toBe(destination);
    expect(relativeFiles(destination)).toEqual([
      'SKILL.md',
      'references/guide.md',
      'scripts/run.sh',
    ]);
    expect(existsSync(join(destination, 'stale.md'))).toBe(false);
    expect(readFileSync(join(sibling, 'SKILL.md'), 'utf8')).toBe('sibling\n');
    if (process.platform !== 'win32') {
      expect(statSync(join(destination, 'scripts/run.sh')).mode & 0o777).toBe(0o755);
      expect(statSync(join(destination, 'references/guide.md')).mode & 0o777).toBe(0o644);
    }
    expect(checkCompilationSnapshot(install.plan, destination).issues).toEqual([]);
  });

  test('detects installed drift and unexpected files without writing', () => {
    const source = fixtureSkill();
    const install = buildInstallPlan({
      sourceDir: source,
      target: 'codex',
      artifact: 'skill',
      scope: 'project',
      projectRoot: join(temporaryRoot, 'project'),
    });
    materializeCompilation(install.plan, install.destinationRoot);
    writeFileSync(join(install.destinationRoot, 'SKILL.md'), 'changed\n');
    writeFileSync(join(install.destinationRoot, 'extra.txt'), 'extra\n');
    const before = relativeFiles(install.destinationRoot);

    const result = checkCompilationSnapshot(install.plan, install.destinationRoot);

    expect(result.issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      'changed-output:SKILL.md',
      'invalid-artifact-frontmatter:SKILL.md',
      'unexpected-output:extra.txt',
    ]);
    expect(relativeFiles(install.destinationRoot)).toEqual(before);
  });

  test('resolves native user, project, and plugin skill roots through targets', () => {
    const context = {
      homeDirectory: '/home/tester',
      projectRoot: '/workspace/project',
      pluginRoot: '/workspace/plugin',
    };
    const locations = (target: 'claude' | 'codex' | 'opencode' | 'pi') =>
      getArtifactConfig(target, 'skill')?.installLocations;

    expect(locations('claude')?.user?.(context)).toBe('/home/tester/.claude/skills');
    expect(locations('claude')?.project?.(context)).toBe('/workspace/project/.claude/skills');
    expect(locations('codex')?.user?.(context)).toBe('/home/tester/.agents/skills');
    expect(locations('codex')?.project?.(context)).toBe('/workspace/project/.agents/skills');
    expect(locations('opencode')?.user?.(context)).toBe('/home/tester/.config/opencode/skills');
    expect(locations('opencode')?.project?.(context)).toBe('/workspace/project/.opencode/skills');
    expect(locations('opencode')?.plugin).toBeUndefined();
    expect(locations('pi')?.user?.(context)).toBe('/home/tester/.pi/agent/skills');
    expect(locations('pi')?.project?.(context)).toBe('/workspace/project/.pi/skills');
    expect(locations('pi')?.plugin?.(context)).toBe('/workspace/plugin/skills');
    expect(getArtifactConfig('claude', 'agent')?.installLocations.user?.(context)).toBe(
      '/home/tester/.claude/agents',
    );
    expect(getArtifactConfig('claude', 'agent')?.installLocations.project?.(context)).toBe(
      '/workspace/project/.claude/agents',
    );
    expect(getArtifactConfig('claude', 'agent')?.installLocations.plugin?.(context)).toBe(
      '/workspace/plugin/agents',
    );
    expect(getArtifactConfig('codex', 'agent')?.installLocations.user?.(context)).toBe(
      '/home/tester/.codex/agents',
    );
    expect(getArtifactConfig('codex', 'agent')?.installLocations.project?.(context)).toBe(
      '/workspace/project/.codex/agents',
    );
  });

  for (const { target, scope, relativeRoot, filename } of [
    {
      target: 'claude' as const,
      scope: 'project' as const,
      relativeRoot: '.claude/agents',
      filename: 'vault-reader.md',
    },
    {
      target: 'codex' as const,
      scope: 'project' as const,
      relativeRoot: '.codex/agents',
      filename: 'vault-reader.toml',
    },
  ]) {
    test(`installs one ${target} agent without owning sibling files`, () => {
      const scopeRoot = join(temporaryRoot, target);
      const projectRoot =
        scope === 'project' ? scopeRoot : join(temporaryRoot, `${target}-project`);
      const homeDirectory = scopeRoot;
      const destinationRoot = join(scopeRoot, relativeRoot);
      const sibling = join(destinationRoot, 'sibling.txt');
      const destination = join(destinationRoot, filename);
      mkdirSync(destinationRoot, { recursive: true });
      writeFileSync(sibling, 'sibling\n');
      writeFileSync(destination, 'old agent\n');

      const install = buildInstallPlan({
        sourceDir: FIXTURE_AGENT,
        target,
        artifact: 'agent',
        scope,
        projectRoot,
        homeDirectory,
      });
      expect(install.destinationRoot).toBe(destinationRoot);
      expect(install.ownership).toBe('planned-files');
      expect(install.plan.outputs.map(({ destination }) => destination)).toEqual([filename]);

      materializeInstallPlan(install);

      expect(readFileSync(sibling, 'utf8')).toBe('sibling\n');
      expect(readFileSync(destination, 'utf8')).not.toBe('old agent\n');
      expect(checkInstallPlan(install).issues).toEqual([]);

      writeFileSync(sibling, 'changed sibling\n');
      expect(checkInstallPlan(install).issues).toEqual([]);
      writeFileSync(destination, 'changed agent\n');
      expect(checkInstallPlan(install).issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
        `changed-output:${filename}`,
      ]);
    });
  }

  test('installs a Claude agent and its resources as planned files at plugin scope', () => {
    const source = fixtureAgentWithResources();
    const pluginRoot = join(temporaryRoot, 'plugin');
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), '{"name":"keep"}\n');
    mkdirSync(join(pluginRoot, 'agents'), { recursive: true });
    writeFileSync(join(pluginRoot, 'agents/sibling.md'), '# sibling\n');
    mkdirSync(join(pluginRoot, 'references'), { recursive: true });
    writeFileSync(join(pluginRoot, 'references/sibling.md'), '# sibling reference\n');

    const install = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'agent',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });

    expect(install.destinationRoot).toBe(pluginRoot);
    expect(install.ownership).toBe('planned-files');
    expect(install.plan.outputs.map(({ destination }) => destination)).toEqual([
      'agents/vault-reader.md',
      'assets/prompt.txt',
      'references/bases.md',
      'references/obsidian-cli-gotchas.md',
      'references/vault-conventions.md',
      'scripts/read-vault.sh',
    ]);
    expect(install.plan.diagnostics.map(({ code }) => code)).not.toContain(
      'construct-support-gated',
    );

    materializeInstallPlan(install);

    expect(readFileSync(join(pluginRoot, 'plugin.json'), 'utf8')).toBe('{"name":"keep"}\n');
    expect(readFileSync(join(pluginRoot, 'agents/sibling.md'), 'utf8')).toBe('# sibling\n');
    expect(readFileSync(join(pluginRoot, 'references/sibling.md'), 'utf8')).toBe(
      '# sibling reference\n',
    );
    expect(readFileSync(join(pluginRoot, 'references/vault-conventions.md'), 'utf8')).toBe(
      '# Vault conventions\n',
    );
    if (process.platform !== 'win32') {
      expect(statSync(join(pluginRoot, 'scripts/read-vault.sh')).mode & 0o777).toBe(0o755);
    }
    expect(checkInstallPlan(install).issues).toEqual([]);

    writeFileSync(join(pluginRoot, 'references/vault-conventions.md'), '# Drifted\n');
    expect(checkInstallPlan(install).issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      'changed-output:references/vault-conventions.md',
    ]);
  });

  test('keeps Claude user and project agents one-file and reports plugin-root references', () => {
    const source = fixtureAgentWithResources();
    const projectRoot = join(temporaryRoot, 'project-agent-with-resources');
    const install = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });

    expect(install.plan.outputs.map(({ destination }) => destination)).toEqual(['vault-reader.md']);
    expect(install.plan.diagnostics.map(({ code }) => code)).toContain('construct-support-gated');

    materializeInstallPlan(install);

    expect(existsSync(join(install.destinationRoot, 'references'))).toBe(false);
  });

  test('file-layout installation refuses an irregular destination without touching siblings', () => {
    const projectRoot = join(temporaryRoot, 'irregular');
    const destinationRoot = join(projectRoot, '.claude/agents');
    const external = join(temporaryRoot, 'external.md');
    const destination = join(destinationRoot, 'vault-reader.md');
    mkdirSync(destinationRoot, { recursive: true });
    writeFileSync(external, 'external\n');
    writeFileSync(join(destinationRoot, 'sibling.md'), 'sibling\n');
    symlinkSync(external, destination);
    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });

    expect(() => materializeInstallPlan(install)).toThrow(
      'managed output must replace only a regular file',
    );
    expect(readFileSync(external, 'utf8')).toBe('external\n');
    expect(readFileSync(join(destinationRoot, 'sibling.md'), 'utf8')).toBe('sibling\n');
  });

  test('file-layout installation refuses a directory at the managed path', () => {
    const homeDirectory = join(temporaryRoot, 'directory-collision');
    const destinationRoot = join(homeDirectory, '.codex/agents');
    const destination = join(destinationRoot, 'vault-reader.toml');
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, 'keep.txt'), 'keep\n');
    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'codex',
      artifact: 'agent',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'directory-collision-project'),
      homeDirectory,
    });

    expect(() => materializeInstallPlan(install)).toThrow(
      'managed output must replace only a regular file',
    );
    expect(readFileSync(join(destination, 'keep.txt'), 'utf8')).toBe('keep\n');
  });

  test('file-layout check refuses a symlinked shared root', () => {
    const projectRoot = join(temporaryRoot, 'symlinked-root');
    const destinationRoot = join(projectRoot, '.claude/agents');
    const externalRoot = join(temporaryRoot, 'external-agents');
    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });
    const output = install.plan.outputs[0];
    if (output?.kind !== 'generated') throw new Error('missing generated Claude agent');
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    mkdirSync(externalRoot);
    writeFileSync(join(externalRoot, 'vault-reader.md'), output.content);
    symlinkSync(externalRoot, destinationRoot);

    expect(checkInstallPlan(install).issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      'unsafe-output-entry:vault-reader.md',
    ]);
  });

  test('check-install does not throw when the destination root itself is a regular file', () => {
    // Regression: the collision detector's readPathBytes joins a destination
    // onto this root, and `lstatSync(..., { throwIfNoEntry: false })` only
    // suppresses ENOENT — a root that is a plain file (not a directory)
    // still throws ENOTDIR on the joined path. That must not crash
    // check-install, which is documented and tested as read-only.
    const projectRoot = join(temporaryRoot, 'malformed-root');
    const destinationRoot = join(projectRoot, '.claude/agents');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(destinationRoot, 'not a directory\n');
    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });

    let result: ReturnType<typeof checkInstallPlan> | undefined;
    expect(() => {
      result = checkInstallPlan(install);
    }).not.toThrow();
    expect(result?.issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      'unsafe-output-entry:vault-reader.md',
    ]);
  });

  test('installs a user-scoped agent into a fresh native root', () => {
    const homeDirectory = join(temporaryRoot, 'home');
    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'codex',
      artifact: 'agent',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'project'),
      homeDirectory,
    });

    materializeInstallPlan(install);

    expect(install.destinationRoot).toBe(join(homeDirectory, '.codex/agents'));
    expect(readFileSync(join(install.destinationRoot, 'vault-reader.toml'), 'utf8')).toContain(
      'developer_instructions',
    );
  });

  test('renaming a file-layout artifact leaves the old path untouched', () => {
    const projectRoot = join(temporaryRoot, 'renamed-agent');
    const original = buildInstallPlan({
      sourceDir: fixtureAgent('original-reader'),
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });
    materializeInstallPlan(original);
    const oldPath = join(original.destinationRoot, 'original-reader.md');
    const oldBytes = readFileSync(oldPath, 'utf8');

    const renamed = buildInstallPlan({
      sourceDir: fixtureAgent('renamed-reader'),
      target: 'claude',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });
    materializeInstallPlan(renamed);

    expect(readFileSync(oldPath, 'utf8')).toBe(oldBytes);
    expect(readFileSync(join(renamed.destinationRoot, 'renamed-reader.md'), 'utf8')).toContain(
      'name: renamed-reader',
    );
  });

  test('Pi retains its native explicit-only and allowed-tools fields', () => {
    const source = fixtureSkill({ explicitOnly: true });
    const install = buildInstallPlan({
      sourceDir: source,
      target: 'pi',
      artifact: 'skill',
      scope: 'project',
      projectRoot: join(temporaryRoot, 'project'),
    });
    const canonical = install.plan.outputs.find(({ destination }) => destination === 'SKILL.md');

    expect(canonical?.kind).toBe('generated');
    if (canonical?.kind !== 'generated') throw new Error('missing Pi SKILL.md');
    expect(canonical.content).toContain('disable-model-invocation: true');
    expect(canonical.content).toContain('allowed-tools: Read Bash');
    expect(install.plan.diagnostics).toEqual([]);
  });

  test('Pi rejects the array form of allowed-tools that its native schema cannot express', () => {
    const source = fixtureSkill();
    writeFileSync(
      join(source, 'SKILL.md'),
      '---\nname: demo\ndescription: Demonstrate installation.\nallowed-tools:\n  - Read\n---\n\n# Demo\n',
    );

    expect(() =>
      buildInstallPlan({
        sourceDir: source,
        target: 'pi',
        artifact: 'skill',
        scope: 'project',
        projectRoot: join(temporaryRoot, 'project'),
      }),
    ).toThrow();
  });

  test('refuses unsupported-scope installation', () => {
    const source = fixtureSkill();
    expect(() =>
      buildInstallPlan({
        sourceDir: source,
        target: 'claude-chat',
        artifact: 'skill',
        scope: 'project',
        projectRoot: temporaryRoot,
      }),
    ).toThrow('does not support project-scope installation');

    expect(() =>
      buildInstallPlan({
        sourceDir: source,
        target: 'claude',
        artifact: 'output-style',
        scope: 'user',
        projectRoot: temporaryRoot,
      }),
    ).toThrow('does not support user-scope installation for artifact output-style');

    expect(() =>
      buildInstallPlan({
        sourceDir: FIXTURE_AGENT,
        target: 'codex',
        artifact: 'agent',
        scope: 'plugin',
        projectRoot: temporaryRoot,
        pluginRoot: join(temporaryRoot, 'plugin'),
      }),
    ).toThrow('does not support plugin-scope installation for artifact agent');
  });

  test('planning a Codex project-scope agent install writes nothing', () => {
    const projectRoot = join(temporaryRoot, 'codex-project-plan');
    mkdirSync(projectRoot, { recursive: true });

    const install = buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'codex',
      artifact: 'agent',
      scope: 'project',
      projectRoot,
    });

    expect(install.destinationRoot).toBe(join(projectRoot, '.codex/agents'));
    expect(install.plan.outputs.map(({ destination }) => destination)).toEqual([
      'vault-reader.toml',
    ]);
    // Planning is pure; materialization remains the only write boundary.
    expect(existsSync(join(projectRoot, '.codex'))).toBe(false);
  });
});

describe('cross-target install collisions', () => {
  test('a differing second target refuses and leaves the first target untouched', () => {
    const source = fixtureSkill({ explicitOnly: true });
    const pluginRoot = join(temporaryRoot, 'plugin');
    const claudeInstall = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });
    materializeInstallPlan(claudeInstall);
    const before = readFileSync(join(claudeInstall.destinationRoot, 'SKILL.md'), 'utf8');
    expect(before).toContain('allowed-tools: Read Bash');

    const codexInstall = buildInstallPlan({
      sourceDir: source,
      target: 'codex',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });

    expect(claudeInstall.destinationRoot).toBe(codexInstall.destinationRoot);
    let thrown: unknown;
    try {
      materializeInstallPlan(codexInstall);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('already holds the "claude" projection');
    expect(message).toContain('differs from "codex"');
    expect(message).toContain('differs: frontmatter "allowed-tools"');
    // One line, so cli.ts formats it as a single console.error and report.ts
    // keeps it inside one Markdown list item.
    expect(message).not.toContain('\n');
    // The first target's output survives byte-for-byte; nothing was staged
    // or swapped once the collision was detected.
    expect(readFileSync(join(claudeInstall.destinationRoot, 'SKILL.md'), 'utf8')).toBe(before);
  });

  test('a byte-identical second target installs without a false-positive refusal', () => {
    const source = fixtureSkill();
    const pluginRoot = join(temporaryRoot, 'plugin');
    const claudeInstall = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });
    materializeInstallPlan(claudeInstall);

    const piInstall = buildInstallPlan({
      sourceDir: source,
      target: 'pi',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });
    // Plain name/description content projects identically for claude and pi,
    // so this is not a collision: it is indistinguishable from re-installing
    // the same target.
    expect(() => materializeInstallPlan(piInstall)).not.toThrow();
    expect(checkInstallPlan(piInstall).issues).toEqual([]);
  });

  test('the same target re-installing an updated source still overwrites', () => {
    const pluginRoot = join(temporaryRoot, 'plugin');
    const v1 = fixtureSkill();
    const install1 = buildInstallPlan({
      sourceDir: v1,
      target: 'claude',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });
    materializeInstallPlan(install1);

    writeFileSync(
      join(v1, 'SKILL.md'),
      '---\nname: demo\ndescription: Updated description.\n---\n\n# Demo\n',
    );
    const install2 = buildInstallPlan({
      sourceDir: v1,
      target: 'claude',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });

    expect(() => materializeInstallPlan(install2)).not.toThrow();
    expect(readFileSync(join(install2.destinationRoot, 'SKILL.md'), 'utf8')).toContain(
      'Updated description.',
    );
  });

  test('a user-scope install does not collide with another target at its own distinct destination', () => {
    // Regression: the candidate loop used to compare bytes already on disk
    // against every OTHER target's projection with no check that the
    // candidate's own resolved destination is the same directory. At
    // user/project scope every target has its own location root
    // (.claude/skills vs .agents/skills), so byte-identical content sitting
    // at codex's own real destination can never actually be claude's
    // output — claude would never write there. Simulate that scenario
    // directly (as if the bytes were copied in by hand) and assert it is no
    // longer misattributed as a collision.
    const source = fixtureSkill({ explicitOnly: true });
    const homeDirectory = join(temporaryRoot, 'home');
    const claudeInstall = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'skill',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'project'),
      homeDirectory,
    });
    const codexInstall = buildInstallPlan({
      sourceDir: source,
      target: 'codex',
      artifact: 'skill',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'project'),
      homeDirectory,
    });
    expect(claudeInstall.destinationRoot).not.toBe(codexInstall.destinationRoot);
    materializeInstallPlan(claudeInstall);

    // Copy claude's real output tree byte-for-byte into codex's own
    // (distinct) destination, so codex's on-disk bytes are claude's
    // projection exactly, including passthrough resource files.
    cpSync(claudeInstall.destinationRoot, codexInstall.destinationRoot, { recursive: true });

    const result = checkInstallPlan(codexInstall);
    expect(result.issues.map(({ code }) => code)).not.toContain('cross-target-install-collision');
    expect(() => materializeInstallPlan(codexInstall)).not.toThrow();
  });

  test('check-install reports the collision as a diagnostic without writing', () => {
    const source = fixtureSkill({ explicitOnly: true });
    const pluginRoot = join(temporaryRoot, 'plugin');
    const claudeInstall = buildInstallPlan({
      sourceDir: source,
      target: 'claude',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });
    materializeInstallPlan(claudeInstall);
    const before = relativeFiles(claudeInstall.destinationRoot);
    const beforeSkill = readFileSync(join(claudeInstall.destinationRoot, 'SKILL.md'), 'utf8');

    const codexInstall = buildInstallPlan({
      sourceDir: source,
      target: 'codex',
      artifact: 'skill',
      scope: 'plugin',
      projectRoot: temporaryRoot,
      pluginRoot,
    });

    const result = checkInstallPlan(codexInstall);

    expect(result.issues.map(({ code }) => code)).toContain('cross-target-install-collision');
    const collisionIssue = result.issues.find(
      ({ code }) => code === 'cross-target-install-collision',
    );
    expect(collisionIssue?.message).toContain('already holds the "claude" projection');
    expect(collisionIssue?.message).not.toContain('\n');
    // Read-only: nothing was written or removed.
    expect(relativeFiles(codexInstall.destinationRoot)).toEqual(before);
    expect(readFileSync(join(codexInstall.destinationRoot, 'SKILL.md'), 'utf8')).toBe(beforeSkill);
  });
});

function fixtureSkill(options: { explicitOnly?: boolean } = {}): string {
  const root = join(temporaryRoot, 'source');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'references'), { recursive: true });
  writeFileSync(
    join(root, 'SKILL.md'),
    `---\nname: demo\ndescription: Demonstrate installation.\n${options.explicitOnly ? 'disable-model-invocation: true\nallowed-tools: Read Bash\n' : ''}---\n\n# Demo\n`,
  );
  writeFileSync(join(root, 'scripts/run.sh'), '#!/bin/sh\n');
  writeFileSync(join(root, 'references/guide.md'), '# Guide\n');
  chmodSync(join(root, 'scripts/run.sh'), 0o755);
  chmodSync(join(root, 'references/guide.md'), 0o640);
  return root;
}

function fixtureAgent(name: string): string {
  const root = join(temporaryRoot, `source-${name}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'AGENT.md'),
    `---\nname: ${name}\ndescription: Read the vault.\n---\n\n# Reader\n\nRead safely.\n`,
  );
  return root;
}

function fixtureAgentWithResources(): string {
  const root = join(temporaryRoot, 'source-agent-with-resources');
  mkdirSync(join(root, 'references'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(
    join(root, 'AGENT.md'),
    [
      '---',
      'name: vault-reader',
      'description: Read the vault.',
      '---',
      '',
      '# Reader',
      '',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Claude variable under test
      'Read ${CLAUDE_PLUGIN_ROOT}/references/vault-conventions.md.',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Claude variable under test
      'Read ${CLAUDE_PLUGIN_ROOT}/references/bases.md.',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Claude variable under test
      'Read ${CLAUDE_PLUGIN_ROOT}/references/obsidian-cli-gotchas.md.',
      '',
    ].join('\n'),
  );
  writeFileSync(join(root, 'references/vault-conventions.md'), '# Vault conventions\n');
  writeFileSync(join(root, 'references/bases.md'), '# Bases\n');
  writeFileSync(join(root, 'references/obsidian-cli-gotchas.md'), '# Gotchas\n');
  writeFileSync(join(root, 'scripts/read-vault.sh'), '#!/bin/sh\n');
  writeFileSync(join(root, 'assets/prompt.txt'), 'prompt\n');
  chmodSync(join(root, 'scripts/read-vault.sh'), 0o755);
  return root;
}

function relativeFiles(root: string, directory = root): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? relativeFiles(root, path) : [path.slice(root.length + 1)];
    })
    .toSorted();
}
