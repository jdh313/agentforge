import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-cli-'));
});

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('install commands', () => {
  test('installs and checks a Pi project skill at its target-owned location', () => {
    const source = fixtureSkill();
    const projectRoot = join(temporaryRoot, 'project');
    const destination = join(projectRoot, '.pi/skills/demo');

    const installed = runCli(
      'install',
      source,
      '--target',
      'pi',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    );
    const checked = runCli(
      'check-install',
      source,
      '--target',
      'pi',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    );

    expect(installed.exitCode).toBe(0);
    expect(installed.stderr).toBe('');
    expect(installed.stdout).toContain(`installed 2 files at ${destination}`);
    expect(readFileSync(join(destination, 'SKILL.md'), 'utf8')).toContain('name: demo');
    expect(existsSync(join(destination, 'references/guide.md'))).toBe(true);
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toContain(`ok: 2 managed files at ${destination}`);
    expect(checked.stderr).toBe('');
  });

  test('check-install reports drift and leaves the installed bytes untouched', () => {
    const source = fixtureSkill();
    const projectRoot = join(temporaryRoot, 'project');
    const args = [
      source,
      '--target',
      'claude',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    ];
    expect(runCli('install', ...args).exitCode).toBe(0);
    const installedPath = join(projectRoot, '.claude/skills/demo/SKILL.md');
    writeFileSync(installedPath, 'changed\n');

    const checked = runCli('check-install', ...args);

    expect(checked.exitCode).toBe(1);
    expect(checked.stdout).toContain('failed: 2 managed files');
    expect(checked.stderr).toContain('changed-output: SKILL.md');
    expect(readFileSync(installedPath, 'utf8')).toBe('changed\n');
  });

  test('requires the installation scope explicitly', () => {
    const result = runCli('install', fixtureSkill(), '--target', 'pi');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("required option '-s, --scope <scope>' not specified");
  });

  test('installs and checks a Codex project agent without pruning siblings', () => {
    const projectRoot = join(temporaryRoot, 'agent-project');
    const agentsRoot = join(projectRoot, '.codex/agents');
    mkdirSync(agentsRoot, { recursive: true });
    writeFileSync(join(agentsRoot, 'sibling.toml'), 'name = "sibling"\n');
    const args = [
      join(REPO_ROOT, 'tests/fixtures/agent-basic'),
      '--target',
      'codex',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    ];

    const installed = runCli('install', ...args);
    const checked = runCli('check-install', ...args);

    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain(`installed 1 files at ${agentsRoot}`);
    expect(readFileSync(join(agentsRoot, 'vault-reader.toml'), 'utf8')).toContain(
      'developer_instructions',
    );
    expect(readFileSync(join(agentsRoot, 'sibling.toml'), 'utf8')).toBe('name = "sibling"\n');
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toContain(`ok: 1 managed files at ${agentsRoot}`);
  });
});

function fixtureSkill(): string {
  const root = join(temporaryRoot, 'source');
  mkdirSync(join(root, 'references'), { recursive: true });
  writeFileSync(
    join(root, 'SKILL.md'),
    '---\nname: demo\ndescription: Demonstrate installation.\n---\n\n# Demo\n',
  );
  writeFileSync(join(root, 'references/guide.md'), '# Guide\n');
  return root;
}

function runCli(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', CLI, ...args],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
