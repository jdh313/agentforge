import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCompilationSnapshot } from 'agentforge/check';
import { buildInstallPlan } from 'agentforge/install';
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

  test('refuses file-layout and unsupported-scope installation', () => {
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
    ).toThrow('install supports directory artifacts only');

    expect(() =>
      buildInstallPlan({
        sourceDir: FIXTURE_AGENT,
        target: 'claude',
        artifact: 'agent',
        scope: 'user',
        projectRoot: temporaryRoot,
      }),
    ).toThrow('install supports directory artifacts only; agent uses file layout');
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

function relativeFiles(root: string, directory = root): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? relativeFiles(root, path) : [path.slice(root.length + 1)];
    })
    .toSorted();
}
