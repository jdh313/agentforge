#!/usr/bin/env bun
/** Deterministic runtime acceptance, not a model evaluation. See docs/pi-extension-acceptance.md. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PIN = '1.1.0';
const PACKAGE = '@earendil-works/pi-coding-agent';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = fileURLToPath(import.meta.url);

async function json(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function runtimeRoot() {
  const override = process.env.PI_ACCEPTANCE_RUNTIME_DIR;
  const executable = Bun.which(process.env.PI_ACCEPTANCE_EXECUTABLE ?? 'pi');
  const candidates: string[] = override ? [resolve(override)] : [];
  if (!override && executable) {
    let current = dirname(await realpath(executable));
    for (;;) {
      candidates.push(
        current,
        join(current, 'node_modules', PACKAGE),
        join(current, 'lib', 'node_modules', PACKAGE),
        join(current, 'libexec', 'lib', 'node_modules', PACKAGE),
      );
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  for (const candidate of candidates) {
    let manifest: { name?: string; version?: string };
    try {
      manifest = await json(join(candidate, 'package.json'));
    } catch {
      continue;
    }
    if (manifest.name !== PACKAGE) continue;
    assert.equal(manifest.version, PIN, `Acceptance requires Pi ${PIN}, found ${manifest.version}`);
    await readFile(join(candidate, 'dist/index.js'));
    return candidate;
  }
  throw new Error(
    `Missing installed Pi ${PIN} SDK. Set PI_ACCEPTANCE_RUNTIME_DIR to its package root.`,
  );
}

function cleanEnv(root: string, runtime: string): Record<string, string> {
  // Allowlist, never forward provider credentials, user npm config, NODE_OPTIONS, or Pi state.
  return {
    PATH: process.env.PATH ?? '',
    HOME: join(root, 'home'),
    USERPROFILE: join(root, 'home'),
    TMPDIR: join(root, 'tmp'),
    TMP: join(root, 'tmp'),
    TEMP: join(root, 'tmp'),
    XDG_CONFIG_HOME: join(root, 'home/config'),
    XDG_CACHE_HOME: join(root, 'home/cache'),
    PI_CODING_AGENT_DIR: join(root, 'agent'),
    PI_CODING_AGENT_SESSION_DIR: join(root, 'sessions'),
    PI_OFFLINE: '1',
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
    npm_config_userconfig: join(root, 'empty-npmrc'),
    npm_config_cache: join(root, 'npm-cache'),
    npm_config_ignore_scripts: 'true',
    PI_ACCEPTANCE_RUNTIME_DIR: runtime,
    AF_ACCEPTANCE_ROOT: root,
    AF_ACCEPTANCE_MARKER: join(root, 'markers.jsonl'),
  };
}

function run(command: string[], cwd: string, env: Record<string, string>) {
  const result = spawnSync(command[0] as string, command.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 90_000,
  });
  assert.equal(result.error, undefined, `${command.join(' ')}: ${result.error}`);
  assert.equal(result.status, 0, `${command.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function markers() {
  try {
    return (await readFile(process.env.AF_ACCEPTANCE_MARKER as string, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function worker() {
  const root = process.env.AF_ACCEPTANCE_ROOT as string;
  assert(root, 'Worker must run in a disposable environment');
  const runtime = await runtimeRoot();
  const sdk = await import(pathToFileURL(join(runtime, 'dist/index.js')).href);
  // Any accidental model/network request is an acceptance failure, not a paid call.
  globalThis.fetch = (() => {
    throw new Error('Network forbidden by acceptance');
  }) as typeof fetch;
  const { loadPackageDefinition } = await import('../src/definitions.ts');
  const { compilePackage, materializePackage } = await import('../src/package-compiler.ts');
  const { getTarget } = await import('../src/targets/index.ts');
  const cwd = join(root, 'consumer');
  const agentDir = join(root, 'agent');
  const env = { ...process.env } as Record<string, string>;
  const cli = join(runtime, (await json(join(runtime, 'package.json'))).bin.pi);
  const node = Bun.which('node');
  assert(node, 'Node is required for the installed Pi CLI');
  const pi = (...args: string[]) => run([node, cli, ...args], cwd, env);
  assert.equal(pi('--version').trim(), PIN);

  for (const name of ['native', 'mixed', 'dependency']) {
    const source = join(repo, 'tests/fixtures/pi-extension-acceptance', name, 'PACKAGE.yaml');
    const loaded = await loadPackageDefinition(source);
    const plan = compilePackage(loaded, getTarget('pi'));
    const output = join(root, 'compiled', name);
    await materializePackage(plan, output);
    const manifest = await json(join(output, 'package.json'));
    assert.deepEqual(manifest.pi.extensions, [
      name === 'dependency' ? './extensions/dependency.js' : './extensions/guard.js',
    ]);
    assert.deepEqual(manifest.pi.prompts, []);
    assert.deepEqual(manifest.pi.themes, []);
    assert.equal(manifest.pi.skills.length, name === 'mixed' ? 1 : 0);
    const entry = name === 'dependency' ? 'dependency.js' : 'guard.js';
    assert.equal(
      await readFile(join(output, 'extensions', entry), 'utf8'),
      await readFile(join(dirname(source), 'pi/extensions', entry), 'utf8'),
    );
    await materializePackage(compilePackage(loaded, getTarget('pi')), join(root, 'repeat', name));
    assert.equal(
      await readFile(join(output, 'package.json'), 'utf8'),
      await readFile(join(root, 'repeat', name, 'package.json'), 'utf8'),
    );
    // Disposable consumer copy: never install dependencies in compiler-owned output or source.
    await cp(output, join(root, 'packages', name), { recursive: true });
  }
  // Exercise directory entry points without changing the checked-in native fixture.
  const directorySource = join(root, 'directory-source');
  await cp(join(repo, 'tests/fixtures/pi-extension-acceptance/native'), directorySource, {
    recursive: true,
  });
  await mkdir(join(directorySource, 'pi/entry'));
  await cp(
    join(directorySource, 'pi/extensions/guard.js'),
    join(directorySource, 'pi/entry/index.js'),
  );
  await rm(join(directorySource, 'pi/extensions'), { recursive: true });
  const directoryDefinition = join(directorySource, 'PACKAGE.yaml');
  await writeFile(
    directoryDefinition,
    (await readFile(directoryDefinition, 'utf8'))
      .replace("'./extensions/guard.js'", "'./entry'")
      .replace('source: pi/extensions/', 'source: pi/entry/')
      .replace('destination: extensions/', 'destination: entry/'),
  );
  const directoryPackage = join(root, 'packages/directory');
  await materializePackage(
    compilePackage(await loadPackageDefinition(directoryDefinition), getTarget('pi')),
    directoryPackage,
  );
  assert.deepEqual((await json(join(directoryPackage, 'package.json'))).pi.extensions, ['./entry']);
  assert.equal(
    await readFile(join(directoryPackage, 'entry/index.js'), 'utf8'),
    await readFile(join(directorySource, 'pi/entry/index.js'), 'utf8'),
  );
  assert.deepEqual(await markers(), [], 'Compilation must not execute extension code');

  async function load(approve: boolean, additionalExtensionPaths: string[] = []) {
    const settingsManager = sdk.SettingsManager.create(cwd, agentDir, { projectTrusted: false });
    const loader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      additionalExtensionPaths,
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await loader.reload({ resolveProjectTrust: async () => approve });
    return { loader, settingsManager };
  }
  function assertResources(
    loader: Awaited<ReturnType<typeof load>>['loader'],
    extensions: number,
    skills: number,
  ) {
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.equal(loader.getExtensions().extensions.length, extensions);
    assert.equal(loader.getSkills().skills.length, skills);
    if (skills) assert.equal(loader.getSkills().skills[0].name, 'af-acceptance-skill');
  }
  async function sessionFor(
    loader: Awaited<ReturnType<typeof load>>['loader'],
    settingsManager: Awaited<ReturnType<typeof load>>['settingsManager'],
  ) {
    const modelRuntime = await sdk.ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'),
      modelsPath: join(agentDir, 'models.json'),
    });
    const aiPath = Bun.resolveSync('@earendil-works/pi-ai/utils/event-stream', runtime);
    const ai = await import(pathToFileURL(aiPath).href);
    let requests = 0;
    modelRuntime.registerProvider('af-acceptance', {
      api: 'af-acceptance-fake',
      baseUrl: 'http://invalid.invalid',
      apiKey: 'not-a-credential',
      models: [
        {
          id: 'deterministic',
          name: 'Deterministic fixture',
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 100000,
          maxTokens: 1000,
        },
      ],
      streamSimple: () => {
        requests++;
        assert(requests <= 2, 'Unexpected fake-provider continuation');
        const toolCall = requests === 1;
        const message = {
          role: 'assistant',
          api: 'af-acceptance-fake',
          provider: 'af-acceptance',
          model: 'deterministic',
          timestamp: Date.now(),
          stopReason: toolCall ? 'toolUse' : 'stop',
          content: toolCall
            ? [
                {
                  type: 'toolCall',
                  id: 'acceptance-probe',
                  name: 'af_acceptance_probe',
                  arguments: {},
                },
              ]
            : [{ type: 'text', text: 'deterministic completion' }],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        };
        const stream = ai.createAssistantMessageEventStream();
        stream.push({ type: 'start', partial: message });
        if (toolCall) {
          stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
          stream.push({
            type: 'toolcall_end',
            contentIndex: 0,
            toolCall: message.content[0],
            partial: message,
          });
        } else {
          stream.push({ type: 'text_start', contentIndex: 0, partial: message });
          stream.push({
            type: 'text_delta',
            contentIndex: 0,
            delta: 'deterministic completion',
            partial: message,
          });
          stream.push({
            type: 'text_end',
            contentIndex: 0,
            content: 'deterministic completion',
            partial: message,
          });
        }
        stream.push({ type: 'done', reason: message.stopReason, message });
        stream.end();
        return stream;
      },
    });
    const { session } = await sdk.createAgentSession({
      cwd,
      agentDir,
      resourceLoader: loader,
      settingsManager,
      modelRuntime,
      model: modelRuntime.getModel('af-acceptance', 'deterministic'),
      sessionManager: sdk.SessionManager.inMemory(cwd),
      noTools: 'builtin',
    });
    await session.bindExtensions({
      mode: 'print',
      onError: (error: unknown) => {
        throw error;
      },
    });
    return session;
  }

  const native = join(root, 'packages/native');
  pi('install', native);
  const registeredUser = (await json(join(agentDir, 'settings.json'))).packages;
  assert(
    registeredUser.some((source: string) => resolve(agentDir, source) === native),
    JSON.stringify(registeredUser),
  );
  let loaded = await load(false);
  assertResources(loaded.loader, 1, 0);
  const session = await sessionFor(loaded.loader, loaded.settingsManager);
  try {
    assert((await markers()).some((row) => row.kind === 'start' && row.value === 'asset-loaded'));
    await session.prompt('/af-acceptance'); // Command dispatch, never a model prompt.
    assert((await markers()).some((row) => row.kind === 'command'));
    assert(
      session.getActiveToolNames().includes('af_acceptance_probe'),
      'Real extension tool was not registered',
    );
    await session.prompt('Deterministic tool dispatch fixture');
    const rows = await markers();
    assert(
      rows.some((row) => row.kind === 'blocked'),
      'tool_call guard did not run',
    );
    assert(!rows.some((row) => row.kind === 'executed'), 'Blocked target executed');
    const outcome = rows.find((row) => row.kind === 'outcome');
    assert(outcome?.value.includes('acceptance guard denied target'), 'Block reason lost');
    assert.equal(JSON.parse(outcome.value).isError, true, 'Blocked call must be an error outcome');
    const starts = rows.filter((row) => row.kind === 'start').length;
    await session.reload();
    const reloaded = await markers();
    assert.equal(reloaded.filter((row) => row.kind === 'start').length, starts + 1);
    assert.equal(reloaded.filter((row) => row.kind === 'shutdown').length, 1);
    // SDK host owns final orderly shutdown event; dispose alone is not that event.
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' });
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' });
    assert.equal(
      (await markers()).filter((row) => row.kind === 'shutdown').length,
      2,
      'Shutdown cleanup must be idempotent',
    );
  } finally {
    session.dispose();
  }
  console.log(
    'PASS real loader, helper/assets, command, nested blocked tool call, reload/shutdown',
  );

  const settingsPath = join(agentDir, 'settings.json');
  const settings = await json(settingsPath);
  await writeFile(
    settingsPath,
    JSON.stringify({
      ...settings,
      packages: [{ source: native, extensions: [], skills: [], prompts: [], themes: [] }],
    }),
  );
  loaded = await load(false);
  assertResources(loaded.loader, 0, 0);
  pi('remove', native);
  assert.equal((await json(settingsPath)).packages.length, 0);
  assertResources((await load(false)).loader, 0, 0);

  const mixed = join(root, 'packages/mixed');
  pi('install', '--local', '--approve', mixed);
  const localPath = join(cwd, '.pi/settings.json');
  assert(
    (await json(localPath)).packages.some(
      (source: string) => resolve(dirname(localPath), source) === mixed,
    ),
  );
  assertResources((await load(false)).loader, 0, 0);
  loaded = await load(true);
  assertResources(loaded.loader, 1, 1);
  assert(
    !pi('--help', '--no-approve').includes('--af-acceptance-loaded'),
    'CLI --no-approve loaded project extension',
  );
  assert(
    pi('--help', '--approve').includes('--af-acceptance-loaded'),
    'CLI --approve did not load project extension',
  );
  pi('remove', '--local', '--approve', mixed);
  assert.equal((await json(localPath)).packages.length, 0);
  assertResources((await load(true)).loader, 0, 0);
  console.log(
    'PASS local user/project registration, denied/approved trust, disabled/remove, mixed skill discovery',
  );

  const beforeDirectory = (await markers()).filter((row) => row.kind === 'start').length;
  loaded = await load(false, [directoryPackage]);
  assertResources(loaded.loader, 1, 0);
  const directorySession = await sessionFor(loaded.loader, loaded.settingsManager);
  try {
    const directoryStarts = (await markers()).filter((row) => row.kind === 'start');
    assert.equal(directoryStarts.length, beforeDirectory + 1);
    assert.equal(directoryStarts.at(-1)?.value, 'asset-loaded');
    assert(directorySession.getActiveToolNames().includes('af_acceptance_probe'));
    await directorySession.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' });
  } finally {
    directorySession.dispose();
  }
  console.log(
    'PASS compiled directory entry point, real index.js discovery, relative helper/assets',
  );

  const dependency = join(root, 'packages/dependency');
  loaded = await load(false, [dependency]);
  const failures = loaded.loader.getExtensions().errors;
  assert(failures.length > 0, 'Missing third-party dependency falsely loaded');
  assert(
    JSON.stringify(failures).includes('af-acceptance-tiny-dependency'),
    'Missing dependency not identified',
  );
  const dep = join(dependency, 'node_modules/af-acceptance-tiny-dependency');
  await mkdir(dep, { recursive: true });
  await writeFile(
    join(dep, 'package.json'),
    JSON.stringify({
      name: 'af-acceptance-tiny-dependency',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
    }),
  );
  await writeFile(join(dep, 'index.js'), "export const value = 'locally-provisioned';\n");
  loaded = await load(false, [dependency]);
  assertResources(loaded.loader, 1, 0);
  const dependencySession = await sessionFor(loaded.loader, loaded.settingsManager);
  try {
    assert(
      (await markers()).some(
        (row) => row.kind === 'dependency' && row.value === 'locally-provisioned',
      ),
    );
    await dependencySession.extensionRunner.emit({ type: 'session_shutdown', reason: 'exit' });
  } finally {
    dependencySession.dispose();
  }
  console.log(
    'PASS missing dependency rejected, disposable manually provisioned dependency loaded',
  );

  // CLI compiler/check smoke is mandatory, not silently skipped if its prerequisite is absent.
  const source = join(repo, 'tests/fixtures/pi-extension-acceptance/mixed/PACKAGE.yaml');
  const out = join(root, 'cli-output');
  run(
    [
      process.execPath,
      join(repo, 'src/cli.ts'),
      'package',
      'compile',
      source,
      '--target',
      'pi',
      '--out',
      out,
    ],
    cwd,
    env,
  );
  run(
    [
      process.execPath,
      join(repo, 'src/cli.ts'),
      'package',
      'check',
      source,
      '--target',
      'pi',
      '--out',
      out,
    ],
    cwd,
    env,
  );
  console.log(
    `PASS Pi ${PIN} extension acceptance; fake-provider requests only, no network or package-manager installs`,
  );
}

async function main() {
  if (process.argv.includes('--worker')) return worker();
  const runtime = await runtimeRoot();
  const root = await mkdtemp(join(tmpdir(), 'agentforge-pi-extensions-'));
  try {
    for (const name of ['home', 'tmp', 'agent', 'consumer']) await mkdir(join(root, name));
    await writeFile(join(root, 'empty-npmrc'), '');
    await writeFile(
      join(root, 'agent/settings.json'),
      JSON.stringify({
        enableInstallTelemetry: false,
        enableAnalytics: false,
        cacheWarming: 'off',
        defaultProjectTrust: 'never',
        compaction: { enabled: false },
        retry: { enabled: false },
      }),
    );
    console.log(run([process.execPath, script, '--worker'], root, cleanEnv(root, runtime)).trim());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('FAIL Pi extension acceptance:', error);
  process.exitCode = 1;
});
