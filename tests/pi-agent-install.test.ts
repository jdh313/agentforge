import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInstallPlan, checkInstallPlan, materializeInstallPlan } from '../src/install.ts';
import { ProjectionRefusedError } from '../src/target-adapter.ts';
import { getArtifactConfig } from '../src/targets/index.ts';
import { PI_SUBAGENTS_PACKAGE, PI_SUBAGENTS_VERSION } from '../src/targets/pi.ts';
import { INSTALL_SCOPES, TARGET_NAMES } from '../src/types.ts';

// Pi leaf agent install and check-install (Fibery #140; ndr:hjnabw,
// ndr:d17fnt, ndr:f1s7gm, ndr:jybfry). Every case uses a temporary home and
// project root: nothing here may touch the real `~/.pi`.

const REPO_ROOT = join(import.meta.dir, '..');
const CLI = join(REPO_ROOT, 'src', 'cli.ts');
const FIXTURE_AGENT = join(REPO_ROOT, 'tests/fixtures/agent-basic');
let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-pi-agent-install-'));
});

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

// A source the Pi projection refuses: a shared `tools` with no targets.pi.tools.
const refusedSource = (): string => {
  const dir = join(temporaryRoot, 'refused-source');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'AGENT.md'),
    '---\nname: vault-reader\ndescription: Read the vault.\ntools: [Read]\n---\n\n# Reader\n',
  );
  return dir;
};

const SCOPES = [
  { scope: 'user' as const, relativeRoot: '.pi/agent/agents' },
  { scope: 'project' as const, relativeRoot: '.pi/agents' },
];

for (const { scope, relativeRoot } of SCOPES) {
  describe(`Pi agent install at ${scope} scope`, () => {
    // Home and project root differ, so a destination built from the wrong one
    // lands outside the expected root and fails the assertions.
    const roots = () => {
      const homeDirectory = join(temporaryRoot, 'home');
      const projectRoot = join(temporaryRoot, 'project');
      const base = scope === 'user' ? homeDirectory : projectRoot;
      return { homeDirectory, projectRoot, destinationRoot: join(base, relativeRoot) };
    };
    const plan = () => {
      const { homeDirectory, projectRoot } = roots();
      return buildInstallPlan({
        sourceDir: FIXTURE_AGENT,
        target: 'pi',
        artifact: 'agent',
        scope,
        projectRoot,
        homeDirectory,
      });
    };

    test('writes exactly the planned file and leaves a sibling agent byte-identical', () => {
      const { destinationRoot } = roots();
      mkdirSync(destinationRoot, { recursive: true });
      const siblingBytes = Buffer.from([0x23, 0x20, 0x73, 0x69, 0x62, 0x0a, 0x00, 0xff]);
      writeFileSync(join(destinationRoot, 'sibling.md'), siblingBytes);
      const install = plan();

      expect(install.destinationRoot).toBe(destinationRoot);
      expect(install.ownership).toBe('planned-files');
      expect(install.plan.outputs.map(({ destination }) => destination)).toEqual([
        'vault-reader.md',
      ]);

      materializeInstallPlan(install);

      expect(readdirSync(destinationRoot).sort()).toEqual(['sibling.md', 'vault-reader.md']);
      expect(readFileSync(join(destinationRoot, 'sibling.md')).equals(siblingBytes)).toBe(true);
      expect(readFileSync(join(destinationRoot, 'vault-reader.md'), 'utf8')).toContain(
        'tools:\n  - read\n  - grep',
      );
      expect(checkInstallPlan(install).issues).toEqual([]);
    });

    test('creates a missing agents directory and nothing beside it', () => {
      const install = plan();
      materializeInstallPlan(install);

      const { destinationRoot } = roots();
      expect(readdirSync(destinationRoot)).toEqual(['vault-reader.md']);
    });

    test('check-install reports drift after a hand edit and absence after deletion', () => {
      const install = plan();
      materializeInstallPlan(install);
      const { destinationRoot } = roots();
      const installed = join(destinationRoot, 'vault-reader.md');

      writeFileSync(installed, 'hand edited\n');
      expect(checkInstallPlan(install).issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
        'changed-output:vault-reader.md',
      ]);

      rmSync(installed);
      expect(checkInstallPlan(install).issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
        'missing-output:vault-reader.md',
      ]);
    });

    test('a renamed agent leaves the old file in place (ndr:hjnabw)', () => {
      materializeInstallPlan(plan());
      const { destinationRoot } = roots();
      const renamed = join(temporaryRoot, 'renamed-source');
      mkdirSync(renamed);
      writeFileSync(
        join(renamed, 'AGENT.md'),
        '---\nname: vault-writer\ndescription: Write the vault.\n---\n\n# Writer\n',
      );

      const { homeDirectory, projectRoot } = roots();
      materializeInstallPlan(
        buildInstallPlan({
          sourceDir: renamed,
          target: 'pi',
          artifact: 'agent',
          scope,
          projectRoot,
          homeDirectory,
        }),
      );

      expect(readdirSync(destinationRoot).sort()).toEqual(['vault-reader.md', 'vault-writer.md']);
    });

    test('install of a refused source refuses before writing anything', () => {
      const { homeDirectory, projectRoot, destinationRoot } = roots();
      const options = {
        sourceDir: refusedSource(),
        target: 'pi' as const,
        artifact: 'agent' as const,
        scope,
        projectRoot,
        homeDirectory,
      };

      expect(() => buildInstallPlan(options)).toThrow(ProjectionRefusedError);
      expect(existsSync(destinationRoot)).toBe(false);
    });
  });
}

describe('Pi agent install: $PI_CODING_AGENT_DIR at user scope', () => {
  const userPlan = (piAgentDirectory?: string) =>
    buildInstallPlan({
      sourceDir: FIXTURE_AGENT,
      target: 'pi',
      artifact: 'agent',
      scope: 'user',
      projectRoot: join(temporaryRoot, 'project'),
      homeDirectory: join(temporaryRoot, 'home'),
      ...(piAgentDirectory === undefined ? {} : { piAgentDirectory }),
    });

  test('unset: falls back to ~/.pi/agent/agents', () => {
    expect(userPlan().destinationRoot).toBe(join(temporaryRoot, 'home/.pi/agent/agents'));
  });

  test('set: installs to <dir>/agents and leaves the home default untouched', () => {
    const piAgentDirectory = join(temporaryRoot, 'pi-agent-dir');
    const install = userPlan(piAgentDirectory);
    expect(install.destinationRoot).toBe(join(piAgentDirectory, 'agents'));

    materializeInstallPlan(install);
    expect(readdirSync(join(piAgentDirectory, 'agents'))).toEqual(['vault-reader.md']);
    expect(existsSync(join(temporaryRoot, 'home/.pi'))).toBe(false);
    expect(checkInstallPlan(install).issues).toEqual([]);
  });

  test('set to ~/<dir>: expands against the home directory, as Pi does', () => {
    expect(userPlan('~/custom-pi').destinationRoot).toBe(
      join(temporaryRoot, 'home/custom-pi/agents'),
    );
  });

  test('CLI: an empty PI_CODING_AGENT_DIR falls back to HOME, as Pi does', () => {
    const home = join(temporaryRoot, 'empty-env-home');
    const result = runCli(
      { HOME: home, PI_CODING_AGENT_DIR: '' },
      'install',
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'user',
      '--project-root',
      join(temporaryRoot, 'empty-env-project'),
    );
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(home, '.pi/agent/agents/vault-reader.md'))).toBe(true);
  });

  test('does not move the project location or the Pi skill location', () => {
    const piAgentDirectory = join(temporaryRoot, 'pi-agent-dir');
    const context = {
      homeDirectory: join(temporaryRoot, 'home'),
      projectRoot: join(temporaryRoot, 'project'),
      piAgentDirectory,
    };
    expect(getArtifactConfig('pi', 'agent')?.installLocations.project?.(context)).toBe(
      join(temporaryRoot, 'project/.pi/agents'),
    );
    expect(getArtifactConfig('pi', 'skill')?.installLocations.user?.(context)).toBe(
      join(temporaryRoot, 'home/.pi/agent/skills'),
    );
  });

  test('CLI: honors PI_CODING_AGENT_DIR when set and falls back to HOME when unset', () => {
    const home = join(temporaryRoot, 'cli-home');
    const piAgentDirectory = join(temporaryRoot, 'cli-pi-agent-dir');
    const args = [
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'user',
      '--project-root',
      join(temporaryRoot, 'cli-project'),
    ];

    const set = runCli({ HOME: home, PI_CODING_AGENT_DIR: piAgentDirectory }, 'install', ...args);
    expect(set.exitCode).toBe(0);
    expect(existsSync(join(piAgentDirectory, 'agents/vault-reader.md'))).toBe(true);
    expect(existsSync(join(home, '.pi'))).toBe(false);
    expect(
      runCli({ HOME: home, PI_CODING_AGENT_DIR: piAgentDirectory }, 'check-install', ...args)
        .stdout,
    ).toContain(`ok: 1 managed files at ${join(piAgentDirectory, 'agents')}`);

    const unset = runCli({ HOME: home }, 'install', ...args);
    expect(unset.exitCode).toBe(0);
    expect(existsSync(join(home, '.pi/agent/agents/vault-reader.md'))).toBe(true);
  });
});

describe('Pi agent install: unsupported plugin scope', () => {
  test('refuses and names why the extension cannot read a plugin root', () => {
    const pluginRoot = join(temporaryRoot, 'plugin');
    const attempt = () =>
      buildInstallPlan({
        sourceDir: FIXTURE_AGENT,
        target: 'pi',
        artifact: 'agent',
        scope: 'plugin',
        projectRoot: temporaryRoot,
        pluginRoot,
      });

    expect(attempt).toThrow('does not support plugin-scope installation for artifact agent');
    expect(attempt).toThrow('supported scopes for this artifact: user, project');
    expect(attempt).toThrow(
      `${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} discovers agents only`,
    );
    expect(attempt).toThrow('not inside a Pi package');
    expect(existsSync(pluginRoot)).toBe(false);
  });

  test('the reason does not leak onto targets that give none', () => {
    expect(getArtifactConfig('codex', 'agent')?.unsupportedInstallScopeReasons).toBeUndefined();
    expect(getArtifactConfig('pi', 'skill')?.installLocations.plugin).toBeDefined();
  });
});

describe('Pi agent install: cross-target destinations', () => {
  test('no other target resolves an agent to a Pi agents directory', () => {
    // The collision detector arbitrates only a destination two targets share
    // (ndr:f1s7gm). Confirm there is none to arbitrate for Pi agents.
    const context = {
      homeDirectory: join(temporaryRoot, 'home'),
      projectRoot: join(temporaryRoot, 'project'),
      pluginRoot: join(temporaryRoot, 'plugin'),
    };
    for (const scope of INSTALL_SCOPES) {
      const resolved = TARGET_NAMES.flatMap((target) => {
        const location = getArtifactConfig(target, 'agent')?.installLocations[scope];
        return location === undefined ? [] : [[target, location(context)] as const];
      });
      const byPath = Map.groupBy(resolved, ([, path]) => path);
      for (const [path, targets] of byPath) {
        expect({ scope, path, targets: targets.map(([name]) => name) }).toEqual({
          scope,
          path,
          targets: [targets[0]?.[0]],
        });
      }
    }
  });
});

describe('Pi agent install CLI', () => {
  test('installs and checks a project agent, then reports drift and absence', () => {
    const projectRoot = join(temporaryRoot, 'cli-project');
    const agentsRoot = join(projectRoot, '.pi/agents');
    const args = [
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    ];

    const installed = runCli({}, 'install', ...args);
    expect(installed.exitCode).toBe(0);
    expect(installed.stdout).toContain(`installed 1 files at ${agentsRoot}`);
    expect(runCli({}, 'check-install', ...args).stdout).toContain(
      `ok: 1 managed files at ${agentsRoot}`,
    );

    writeFileSync(join(agentsRoot, 'vault-reader.md'), 'changed\n');
    const drifted = runCli({}, 'check-install', ...args);
    expect(drifted.exitCode).toBe(1);
    expect(drifted.stderr).toContain('changed-output: vault-reader.md');

    rmSync(join(agentsRoot, 'vault-reader.md'));
    const absent = runCli({}, 'check-install', ...args);
    expect(absent.exitCode).toBe(1);
    expect(absent.stderr).toContain('missing-output: vault-reader.md');
  });

  test('installs a user agent under a temporary HOME', () => {
    const home = join(temporaryRoot, 'cli-home');
    const result = runCli(
      { HOME: home },
      'install',
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'user',
      '--project-root',
      join(temporaryRoot, 'cli-user-project'),
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(home, '.pi/agent/agents/vault-reader.md'))).toBe(true);
  });

  test('plugin scope fails with the reason', () => {
    const result = runCli(
      {},
      'install',
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'plugin',
      '--plugin-root',
      join(temporaryRoot, 'cli-plugin'),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not inside a Pi package');
  });

  test('a refused source fails install without writing and fails check-install as a diagnostic', () => {
    const projectRoot = join(temporaryRoot, 'refused-project');
    const agentsRoot = join(projectRoot, '.pi/agents');
    // An earlier install of the same name that would pass a bytes-only check.
    const okArgs = [
      FIXTURE_AGENT,
      '--target',
      'pi',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    ];
    expect(runCli({}, 'install', ...okArgs).exitCode).toBe(0);
    const earlier = readFileSync(join(agentsRoot, 'vault-reader.md'));

    const args = [
      refusedSource(),
      '--target',
      'pi',
      '--scope',
      'project',
      '--project-root',
      projectRoot,
    ];
    const installed = runCli({}, 'install', ...args);
    expect(installed.exitCode).toBe(1);
    expect(installed.stdout).not.toContain('installed');
    expect(installed.stderr).toContain('refusing to render agent "vault-reader" for pi');
    expect(installed.stderr).toContain(
      'an agent previously installed at the destination is left in place and is still active',
    );
    expect(readFileSync(join(agentsRoot, 'vault-reader.md')).equals(earlier)).toBe(true);

    const checked = runCli({}, 'check-install', ...args);
    expect(checked.exitCode).toBe(1);
    expect(checked.stdout).not.toContain('ok:');
    expect(checked.stdout).toContain('failed: pi refuses to project this source');
    expect(checked.stderr).toContain('projection-refused');
    expect(checked.stderr).toContain('refusing to render agent "vault-reader" for pi');
  });
});

function runCli(
  env: Record<string, string>,
  ...args: string[]
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', CLI, ...args],
    cwd: REPO_ROOT,
    // A developer's own PI_CODING_AGENT_DIR must not leak into a case that
    // does not set it; every case that needs it passes it explicitly.
    env: { ...process.env, PI_CODING_AGENT_DIR: undefined, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
