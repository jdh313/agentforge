#!/usr/bin/env bun
// Runtime acceptance for agentforge-installed Pi agents (Fibery #141).
//
// Installs the fixtures in tests/fixtures/pi-acceptance with agentforge into a
// throwaway project and a throwaway PI_CODING_AGENT_DIR, runs a fresh `pi -p`
// per scenario with @gotgenes/pi-subagents loaded, and compares what the
// extension reports against what each control is documented to do. Seven pi
// invocations in total, each with a tiny prompt.
//
// Exit codes:
//   0  every control matches its recorded expectation. A control the
//      extension does not honor passes only while it still fails the same way
//      and EXPECTED names the limitation that records it.
//   1  a control diverged from its expectation (including a documented gap
//      that no longer reproduces), or a scenario could not reach a verdict.
//   2  setup failed before any verdict: pi, the pinned extension, or
//      credentials were not available.
//
// The throwaway agent dir SYMLINKS auth.json and npm/ from the real agent
// dir; nothing is copied. This script writes nothing there itself, but pi
// refreshes an expired OAuth token IN PLACE through the auth.json link, so the
// real auth.json can be written during a run (the rotated token lands in the
// real file; the link is not replaced). pi's refresh lock resolves to the
// throwaway dir (proper-lockfile, realpath: false), so a concurrent real pi
// session refreshing at the same moment is NOT serialized against this run:
// do not run this while another pi session is active. Credentials are never
// read or printed.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import matter from 'gray-matter';
import { PI_SUBAGENTS_PACKAGE, PI_SUBAGENTS_VERSION } from '../src/targets/pi.ts';

const REPO = resolve(dirname(import.meta.path), '..');
const FIXTURES = join(REPO, 'tests/fixtures/pi-acceptance');

// Cheapest model the local OAuth account accepts as parent; the settings probe
// declares a different one so the declared model is distinguishable.
const PARENT_MODEL = process.env.PI_ACCEPTANCE_PARENT_MODEL ?? 'openai/gpt-6-luna';
const CHILD_MODEL = 'openai/gpt-5.6-terra';
const REAL_AGENT_DIR = process.env.PI_ACCEPTANCE_REAL_AGENT_DIR ?? join(homedir(), '.pi/agent');
const SCENARIO_TIMEOUT_MS = 240_000;

// What each control is expected to do on the pinned versions. `holds: false`
// is a recorded gap: the script passes while it reproduces and fails the day
// it stops (the revisit trigger of the named limitation).
const EXPECTED: Record<string, { holds: boolean; limitation?: string }> = {
  'project-discovery': { holds: true },
  delegation: { holds: true },
  model: { holds: true },
  thinking: { holds: true },
  'tools-allowlist': { holds: true },
  'max-turns-ceiling': { holds: true },
  'max-turns-floor': { holds: false, limitation: 'L-015' },
  'caller-override': { holds: false, limitation: 'L-016' },
  resume: { holds: true },
  'user-scope': { holds: true },
  'project-subdirectory': { holds: false, limitation: 'L-015' },
  'extension-absent': { holds: true },
};

interface Row {
  id: string;
  control: string;
  claim: string;
  artifact: string;
  observed: string;
  /** Whether the documented behavior was observed; undefined when inconclusive. */
  holds: boolean | undefined;
}

interface ToolCall {
  args: Record<string, unknown>;
  text: string;
  details: Record<string, unknown> | undefined;
  isError: boolean;
}

let piInvocations = 0;
const rows: Row[] = [];
const fatal = (message: string): never => {
  console.error(`setup: ${message}`);
  process.exit(2);
};
if (PARENT_MODEL === CHILD_MODEL) {
  fatal(
    `parent model ${PARENT_MODEL} equals the declared child model; the model row could not tell a honored declaration from an inherited parent model. Set PI_ACCEPTANCE_PARENT_MODEL to a different model.`,
  );
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: SCENARIO_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseArgs(argv: string[]) {
  const options = { keep: false, json: false };
  for (const arg of argv) {
    if (arg === '--keep') options.keep = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'usage: bun run scripts/pi-agent-acceptance.ts [--keep] [--json]\n' +
          '  --keep  keep the throwaway work directory and print its path\n' +
          '  --json  print the result rows as JSON on stdout instead of a table',
      );
      process.exit(0);
    } else fatal(`unknown argument ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

// ---- Preconditions ---------------------------------------------------------

const piVersion = run('pi', ['--version'], {});
if (piVersion.status !== 0) fatal('pi is not on PATH');
const piText = `${piVersion.stdout}${piVersion.stderr}`.trim();

const extensionRoot = join(REAL_AGENT_DIR, 'npm/node_modules', PI_SUBAGENTS_PACKAGE);
if (!existsSync(join(extensionRoot, 'package.json'))) {
  fatal(`${PI_SUBAGENTS_PACKAGE} is not installed under ${join(REAL_AGENT_DIR, 'npm')}`);
}
const extensionManifest = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));
if (extensionManifest.version !== PI_SUBAGENTS_VERSION) {
  fatal(
    `${PI_SUBAGENTS_PACKAGE} ${extensionManifest.version} is installed but agentforge pins ${PI_SUBAGENTS_VERSION}`,
  );
}
if (!existsSync(join(REAL_AGENT_DIR, 'auth.json'))) fatal('no auth.json in the real agent dir');
const extensionEntry = join(extensionRoot, extensionManifest.pi.extensions[0]);

// ---- Throwaway environment -------------------------------------------------

const work = mkdtempSync(join(tmpdir(), 'agentforge-pi-acceptance-'));
const agentDir = join(work, 'agentdir');
const project = join(work, 'project');
const subdirectory = join(project, 'sub');
const bare = join(work, 'bare');
for (const dir of [agentDir, project, subdirectory, bare, join(project, 'notes')]) {
  mkdirSync(dir, { recursive: true });
}
symlinkSync(join(REAL_AGENT_DIR, 'auth.json'), join(agentDir, 'auth.json'));
symlinkSync(join(REAL_AGENT_DIR, 'npm'), join(agentDir, 'npm'));
for (let n = 1; n <= 6; n++) writeFileSync(join(project, 'notes', `${n}.txt`), `${n}\n`);

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (options.keep) {
    console.error(`kept work directory ${work}`);
    return;
  }
  // Unlink the two symlinks first so a recursive remove can never follow them.
  for (const link of ['auth.json', 'npm']) {
    try {
      unlinkSync(join(agentDir, link));
    } catch {}
  }
  rmSync(work, { recursive: true, force: true });
}
process.on('exit', cleanup);
// A signal or an uncaught error skips the 'exit' event's usual path, which would
// leave a live symlink to the real auth.json in the temp dir. cleanup() unlinks
// the links first, then removes the directory, in every case.
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(code);
  });
}
process.on('uncaughtException', (error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});

const piEnv = { ...process.env, PI_CODING_AGENT_DIR: agentDir };

function install(agent: string, scope: 'project' | 'user') {
  const result = run(
    'bun',
    [
      'run',
      join(REPO, 'src/cli.ts'),
      'install',
      join(FIXTURES, agent),
      '--target',
      'pi',
      '--scope',
      scope,
      ...(scope === 'project' ? ['--project-root', project] : []),
    ],
    { cwd: REPO, env: piEnv },
  );
  if (result.status !== 0) fatal(`install ${agent} (${scope}) failed: ${result.stderr}`);
}

for (const agent of [
  'acc-settings',
  'acc-readonly',
  'acc-allpi',
  'acc-turns',
  'acc-turns-one',
  'acc-free',
  'acc-memory',
]) {
  install(agent, 'project');
}
install('acc-user', 'user');

function installedFrontmatter(path: string): Record<string, unknown> {
  return matter(readFileSync(path, 'utf8')).data;
}
const projectAgent = (name: string) => join(project, '.pi/agents', `${name}.md`);

// ---- Scenario runner -------------------------------------------------------

/** The slice of pi's `--mode json` events this script reads. */
interface PiEvent {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  isError?: boolean;
  message?: { role?: string; content?: { type?: string; text?: string }[] };
  result?: { content?: { text?: string }[]; details?: Record<string, unknown> };
}

interface ScenarioResult {
  calls: ToolCall[];
  /** Text of the assistant's own messages; excludes the user prompt echo. */
  assistantText: string;
  /** Why pi did not finish cleanly (non-zero exit, timeout, spawn error); undefined on success. */
  failure: string | undefined;
}

function scenario(
  label: string,
  cwd: string,
  prompt: string,
  withExtension: boolean,
): ScenarioResult {
  piInvocations++;
  const args = [
    '-p',
    '--mode',
    'json',
    '--no-session',
    '--no-extensions',
    ...(withExtension ? ['-e', extensionEntry] : []),
    '--no-skills',
    '--no-prompt-templates',
    '--no-context-files',
    '--offline',
    '--model',
    PARENT_MODEL,
    '--thinking',
    'off',
    prompt,
  ];
  const result = run('pi', args, { cwd, env: piEnv });
  writeFileSync(join(work, `${label}.jsonl`), result.stdout ?? '');
  writeFileSync(join(work, `${label}.stderr`), result.stderr ?? '');
  let failure: string | undefined;
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code;
    failure =
      code === 'ETIMEDOUT'
        ? `pi timed out after ${SCENARIO_TIMEOUT_MS} ms`
        : `pi did not run: ${result.error.message}`;
  } else if (result.status !== 0) {
    failure = `pi exited ${result.status ?? `by signal ${result.signal}`}: ${short(result.stderr ?? '')}`;
  }
  const calls = new Map<string, ToolCall>();
  const assistant: string[] = [];
  for (const line of (result.stdout ?? '').split('\n')) {
    if (!line.startsWith('{')) continue;
    let event: PiEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      for (const part of event.message.content ?? []) {
        if (part?.type === 'text' && typeof part.text === 'string') assistant.push(part.text);
      }
    }
    if (event.toolName !== 'subagent') continue;
    if (event.type === 'tool_execution_start') {
      calls.set(event.toolCallId ?? '', {
        args: event.args ?? {},
        text: '',
        details: undefined,
        isError: false,
      });
    } else if (event.type === 'tool_execution_end') {
      const call = calls.get(event.toolCallId ?? '');
      if (call === undefined) continue;
      call.text = (event.result?.content ?? []).map((part) => part.text ?? '').join('');
      call.details = event.result?.details;
      call.isError = event.isError === true;
    }
  }
  if (failure !== undefined) console.error(`scenario ${label}: ${failure}`);
  return { calls: [...calls.values()], assistantText: assistant.join('\n'), failure };
}

function pick(calls: ToolCall[], predicate: (call: ToolCall) => boolean): ToolCall | undefined {
  return calls.find(predicate);
}
const byType = (type: string) => (call: ToolCall) => call.args.subagent_type === type;
const byDescription = (description: string) => (call: ToolCall) =>
  call.args.description === description;
const detail = <T = unknown>(call: ToolCall | undefined, key: string): T | undefined =>
  call?.details?.[key] as T | undefined;
const short = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

function record(row: Row) {
  rows.push(row);
}
type RowSpec = readonly [id: string, control: string, claim: string];
/** Mark every row of a scenario that pi did not finish cleanly as inconclusive. */
function scenarioFailed(result: ScenarioResult, specs: readonly RowSpec[]): boolean {
  if (result.failure === undefined) return false;
  for (const [id, control, claim] of specs) inconclusive(id, control, claim, result.failure);
  return true;
}
function inconclusive(id: string, control: string, claim: string, why: string) {
  record({ id, control, claim, artifact: '-', observed: `INCONCLUSIVE: ${why}`, holds: undefined });
}

const COMMON = 'Do no other work and do not use any other tool. ';

// ---- 1. Discovery, delegation, model, thinking ----------------------------

{
  const scn = scenario(
    'settings',
    project,
    `${COMMON}Call the subagent tool exactly once with subagent_type "acc-settings", description "settings probe", prompt "go". Then reply with only its output.`,
    true,
  );
  const calls = scn.calls;
  const call = pick(calls, byType('acc-settings'));
  const fm = installedFrontmatter(projectAgent('acc-settings'));
  const settingsRows: readonly RowSpec[] = [
    [
      'project-discovery',
      'project discovery',
      'A project agent in <cwd>/.pi/agents loads with no extra configuration',
    ],
    ['delegation', 'delegation', 'The parent delegates to the agent through the subagent tool'],
    ['model', 'model', 'The agent runs on its declared model'],
    ['thinking', 'thinking', 'The agent runs at its declared thinking level'],
  ];
  if (scenarioFailed(scn, settingsRows)) {
    // pi did not finish cleanly; every row of this scenario is inconclusive.
  } else if (call === undefined) {
    for (const [id, control, claim] of settingsRows) {
      inconclusive(id, control, claim, 'the parent never called subagent');
    }
  } else {
    const completed =
      detail(call, 'status') === 'completed' && call.text.includes('ACC_SETTINGS_OK');
    record({
      id: 'project-discovery',
      control: 'project discovery',
      claim: 'A project agent in <cwd>/.pi/agents loads with no extra configuration',
      artifact: '.pi/agents/acc-settings.md exists',
      observed: completed ? 'the agent was found and ran' : `not run: ${short(call.text)}`,
      holds: completed,
    });
    record({
      id: 'delegation',
      control: 'delegation',
      claim: 'The parent delegates to the agent through the subagent tool',
      artifact: 'the subagent tool call names acc-settings',
      observed: `status ${detail(call, 'status')}, reply ${JSON.stringify(short(call.text.split('\n').pop() ?? ''))}`,
      holds: completed,
    });
    const modelName = detail(call, 'modelName');
    record({
      id: 'model',
      control: 'model',
      claim: 'The agent runs on its declared model, not the parent model',
      artifact: `model: ${fm.model} (parent ${PARENT_MODEL})`,
      observed: `modelName ${modelName}`,
      holds: modelName === CHILD_MODEL && fm.model === CHILD_MODEL,
    });
    const tags = detail<string[]>(call, 'tags') ?? [];
    record({
      id: 'thinking',
      control: 'thinking',
      claim: 'The agent runs at its declared thinking level (parent off)',
      artifact: `thinking: ${fm.thinking}`,
      observed: `tags ${JSON.stringify(tags)}`,
      holds: fm.thinking === 'low' && tags.includes('thinking: low'),
    });
  }
}

// ---- 2. Tools allowlist (with a positive control) -------------------------

{
  const scn = scenario(
    'tools',
    project,
    `${COMMON}Make exactly two subagent calls, one after the other, never in parallel. Call 1: subagent_type "acc-readonly", description "tools probe", prompt "Use the bash tool to run: touch marker-readonly. If you have no bash tool, reply exactly NO_BASH_TOOL." Call 2: subagent_type "acc-allpi", description "tools control", prompt "Use the bash tool to run: touch marker-allpi. When it is done reply exactly TOUCHED." After both, reply with only DONE.`,
    true,
  );
  const calls = scn.calls;
  const denied = pick(calls, byType('acc-readonly'));
  const control = pick(calls, byType('acc-allpi'));
  const fm = installedFrontmatter(projectAgent('acc-readonly'));
  const controlRan = control !== undefined && existsSync(join(project, 'marker-allpi'));
  const toolsRow: RowSpec = [
    'tools-allowlist',
    'tools allowlist',
    'A tool outside `tools` is not available to the agent',
  ];
  if (scenarioFailed(scn, [toolsRow])) {
    // inconclusive: pi did not finish cleanly
  } else if (denied === undefined || !controlRan) {
    inconclusive(
      ...toolsRow,
      `positive control did not run (${control === undefined ? 'no call' : 'no marker file'})`,
    );
  } else {
    const marker = existsSync(join(project, 'marker-readonly'));
    record({
      id: 'tools-allowlist',
      control: 'tools allowlist',
      claim: 'A tool outside `tools` is not available to the agent',
      artifact: `tools: ${JSON.stringify(fm.tools)}`,
      observed: `bash side effect ${marker ? 'PRESENT' : 'absent'}; reply ${JSON.stringify(short(denied.text.split('\n').pop() ?? ''))}; control (no tools key) did touch its marker`,
      holds: !marker,
    });
  }
}

// ---- 3. Turn ceiling, floor, caller override ------------------------------

{
  const READ_ALL =
    'Read the files notes/1.txt through notes/6.txt with the read tool, one file per step, one tool call at a time, never several in one step, then reply exactly ALL_READ.';
  const scn = scenario(
    'turns',
    project,
    `${COMMON}Make exactly four subagent calls, one after the other, never in parallel, each with prompt "${READ_ALL}" Call 1: subagent_type "acc-turns", description "ceiling". Call 2: subagent_type "acc-turns-one", description "floor". Call 3: subagent_type "acc-free", description "free". Call 4: subagent_type "acc-turns", description "override", and also pass max_turns 5. After all four, reply with only DONE.`,
    true,
  );
  const calls = scn.calls;
  const ceiling = pick(calls, byDescription('ceiling'));
  const floor = pick(calls, byDescription('floor'));
  const free = pick(calls, byDescription('free'));
  const override = pick(calls, byDescription('override'));
  const budget = (call: ToolCall | undefined) =>
    detail(call, 'turnBudget') as { maxTurns?: number; used: number; phase: string } | undefined;
  const fmTurns = installedFrontmatter(projectAgent('acc-turns'));
  const fmOne = installedFrontmatter(projectAgent('acc-turns-one'));
  const freeRan = free?.text.includes('ALL_READ') && budget(free)?.maxTurns === undefined;

  const turnRows: readonly RowSpec[] = [
    ['max-turns-ceiling', 'max_turns ceiling', 'The agent is stopped at its declared ceiling'],
    ['max-turns-floor', 'max_turns of 1', 'A declared ceiling of 1 is honored as 1'],
    ['caller-override', 'caller override', 'The agent file bounds its caller'],
  ];
  if (scenarioFailed(scn, turnRows)) {
    // inconclusive: pi did not finish cleanly, so a partial log must not feed any row
  } else if (ceiling === undefined || !freeRan) {
    inconclusive(
      'max-turns-ceiling',
      'max_turns ceiling',
      'The agent is stopped at its declared ceiling',
      'the no-ceiling control did not read all files',
    );
  } else {
    const b = budget(ceiling);
    record({
      id: 'max-turns-ceiling',
      control: 'max_turns ceiling',
      claim: 'The harness stops the agent after max_turns turns',
      artifact: `max_turns: ${fmTurns.max_turns}`,
      observed: `turnBudget ${JSON.stringify(b)}, ${detail(ceiling, 'toolUses')} tool uses; control without max_turns finished with ${detail(free, 'toolUses')} tool uses`,
      holds:
        b?.maxTurns === 3 &&
        b.used === 3 &&
        b.phase === 'exhausted' &&
        !ceiling.text.includes('ALL_READ'),
    });
  }
  if (scn.failure !== undefined) {
    // rows already recorded as inconclusive above
  } else if (floor === undefined) {
    inconclusive(
      'max-turns-floor',
      'max_turns of 1',
      'A declared ceiling of 1 is honored as 1',
      'no call',
    );
  } else {
    const b = budget(floor);
    record({
      id: 'max-turns-floor',
      control: 'max_turns of 1',
      claim:
        'A declared max_turns of 1 stops the agent after 1 turn (the extension documents a minimum of 2)',
      artifact: `max_turns: ${fmOne.max_turns}`,
      observed: `turnBudget ${JSON.stringify(b)}`,
      // Only the recorded symptom (the extension's minimum of 2) counts as the gap.
      holds: b?.maxTurns === 1 ? true : b?.maxTurns === 2 ? false : undefined,
    });
  }
  if (scn.failure !== undefined) {
    // rows already recorded as inconclusive above
  } else if (override === undefined) {
    inconclusive(
      'caller-override',
      'caller override',
      'The agent file bounds its caller',
      'no call',
    );
  } else if (Number(override.args.max_turns) !== 5) {
    inconclusive(
      'caller-override',
      'caller override',
      'The agent file bounds its caller',
      `the parent did not pass max_turns 5 (call args max_turns ${JSON.stringify(override.args.max_turns)})`,
    );
  } else {
    const b = budget(override);
    record({
      id: 'caller-override',
      control: 'caller override',
      claim:
        'A declared max_turns bounds the agent whatever the caller asks (the extension documents that a caller value wins unless the file sets `locked`)',
      artifact: `max_turns: ${fmTurns.max_turns}, no locked key`,
      observed: `caller passed max_turns 5; turnBudget ${JSON.stringify(b)}`,
      // The call carried max_turns 5 (checked above). 5 is the recorded gap; 3 is the file
      // value winning; anything else (missing turnBudget, another number) is inconclusive.
      holds: b?.maxTurns === 3 ? true : b?.maxTurns === 5 ? false : undefined,
    });
  }
}

// ---- 4. Resume -------------------------------------------------------------

{
  const scn = scenario(
    'resume',
    project,
    `${COMMON}Make exactly three subagent calls, one after the other. Call 1: subagent_type "acc-memory", description "store", prompt "Remember the codeword PELICAN-42. Reply with exactly: STORED." Call 2: the same subagent_type, description "recall", prompt "What is the codeword? Reply with the codeword only.", and pass resume set to the Agent ID that call 1 returned. Call 3: subagent_type "acc-memory", description "fresh", prompt "What codeword were you told earlier? If none, reply exactly NONE." with no resume. After all three, reply with only DONE.`,
    true,
  );
  const calls = scn.calls;
  const store = pick(calls, byDescription('store'));
  const recall = pick(calls, byDescription('recall'));
  const fresh = pick(calls, byDescription('fresh'));
  if (scenarioFailed(scn, [['resume', 'resume', 'resume continues the same subagent']])) {
    // inconclusive: pi did not finish cleanly
  } else if (store === undefined || recall === undefined || fresh === undefined) {
    inconclusive(
      'resume',
      'resume',
      'resume continues the same subagent',
      'the parent did not make all three calls',
    );
  } else {
    const sameId =
      detail(store, 'agentId') !== undefined &&
      detail(store, 'agentId') === detail(recall, 'agentId');
    const remembered = recall.text.includes('PELICAN-42');
    const freshForgot = !fresh.text.includes('PELICAN-42');
    record({
      id: 'resume',
      control: 'resume',
      claim: 'A call with resume continues the same subagent with its context',
      artifact: 'subagent tool parameter, no file key',
      observed: `agent id ${detail(store, 'agentId')} then ${detail(recall, 'agentId')}; resumed reply ${JSON.stringify(short(recall.text.split('\n').pop() ?? ''))}; fresh agent ${freshForgot ? 'did not know' : 'KNEW'} the codeword`,
      holds: sameId && remembered && freshForgot,
    });
  }
}

// ---- 5. Project agents from a subdirectory --------------------------------

{
  const scn = scenario(
    'subdirectory',
    subdirectory,
    `${COMMON}Call the subagent tool exactly once with subagent_type "acc-settings", description "subdir probe", prompt "go". Then reply with only the tool's output verbatim.`,
    true,
  );
  const calls = scn.calls;
  const call = pick(calls, byType('acc-settings'));
  const subdirectoryRow: RowSpec = [
    'project-subdirectory',
    'project subdirectory',
    'Pi started below the project root loads the project agents',
  ];
  if (scenarioFailed(scn, [subdirectoryRow])) {
    // inconclusive: pi did not finish cleanly
  } else if (call === undefined) {
    inconclusive(
      'project-subdirectory',
      'project subdirectory',
      'Pi started below the project root loads the project agents',
      'the parent never called subagent',
    );
  } else {
    const loaded = detail(call, 'status') === 'completed' && call.text.includes('ACC_SETTINGS_OK');
    record({
      id: 'project-subdirectory',
      control: 'project subdirectory',
      claim:
        'Pi started in a subdirectory of the project loads the project agents (agentforge installs at the repository root)',
      artifact: '<root>/.pi/agents/acc-settings.md; pi cwd <root>/sub',
      observed: loaded
        ? 'the agent was found and ran'
        : `not run: ${JSON.stringify(short(call.text))}`,
      // Only the extension's general-purpose fallback for this agent name is the recorded gap;
      // a provider error, rate limit or timeout is inconclusive, not a gap.
      holds: loaded
        ? true
        : call.text.includes('Unknown agent type "acc-settings"')
          ? false
          : undefined,
    });
  }
}

// ---- 6. User scope ---------------------------------------------------------

{
  const scn = scenario(
    'user',
    bare,
    `${COMMON}Call the subagent tool exactly once with subagent_type "acc-user", description "user probe", prompt "go". Then reply with only its output.`,
    true,
  );
  const calls = scn.calls;
  const call = pick(calls, byType('acc-user'));
  const userFile = join(agentDir, 'agents/acc-user.md');
  if (
    scenarioFailed(scn, [
      ['user-scope', 'user scope', 'A user-scope agent loads from any directory'],
    ])
  ) {
    // inconclusive: pi did not finish cleanly
  } else if (call === undefined) {
    inconclusive(
      'user-scope',
      'user scope',
      'A user-scope agent loads from any directory',
      'the parent never called subagent',
    );
  } else {
    const loaded = detail(call, 'status') === 'completed' && call.text.includes('ACC_USER_OK');
    record({
      id: 'user-scope',
      control: 'user scope',
      claim: 'An agent installed at user scope loads from a directory with no .pi/agents',
      artifact: `$PI_CODING_AGENT_DIR/agents/acc-user.md ${existsSync(userFile) ? 'exists' : 'MISSING'}`,
      observed: loaded
        ? 'the agent was found and ran'
        : `not run: ${JSON.stringify(short(call.text))}`,
      holds: loaded && existsSync(userFile),
    });
  }
}

// ---- 7. Extension absent ---------------------------------------------------

{
  const scn = scenario(
    'absent',
    project,
    'Do no other work and use no tool. If you have a tool named subagent, call it once with subagent_type "acc-settings", description "absent probe", prompt "go". If you have no such tool, reply exactly NO_SUBAGENT_TOOL.',
    false,
  );
  const calls = scn.calls;
  // Match the assistant's own text only: the user prompt (echoed in the JSON log) contains the
  // sentinel too.
  const replied = scn.assistantText.includes('NO_SUBAGENT_TOOL');
  if (
    scenarioFailed(scn, [
      [
        'extension-absent',
        'extension absent',
        'Without the extension the agent files are inert: no subagent tool, nothing delegates',
      ],
    ])
  ) {
    // inconclusive: pi did not reach a model and exit cleanly
  } else {
    record({
      id: 'extension-absent',
      control: 'extension absent',
      claim: 'Without the extension the agent files are inert: no subagent tool, nothing delegates',
      artifact: '.pi/agents/acc-settings.md present, extension not loaded',
      observed: `${calls.length} subagent calls; parent ${replied ? 'reported no subagent tool' : 'did not report the tool absent'}`,
      holds: calls.length === 0 && replied,
    });
  }
}

// ---- Verdict ---------------------------------------------------------------

let failed = false;
const rendered = rows.map((row) => {
  const expected = EXPECTED[row.id];
  let status: string;
  if (expected === undefined) {
    status = 'UNEXPECTED ROW';
    failed = true;
  } else if (row.holds === undefined) {
    status = 'INCONCLUSIVE';
    failed = true;
  } else if (row.holds === expected.holds) {
    status = expected.holds ? 'holds' : `documented gap ${expected.limitation}`;
  } else {
    status = expected.holds
      ? 'DIVERGED: does not hold'
      : `DIVERGED: ${expected.limitation} gap no longer reproduces`;
    failed = true;
  }
  return { ...row, status };
});
for (const id of Object.keys(EXPECTED)) {
  if (!rows.some((row) => row.id === id)) {
    rendered.push({
      id,
      control: id,
      claim: '-',
      artifact: '-',
      observed: 'no row produced',
      holds: undefined,
      status: 'MISSING',
    });
    failed = true;
  }
}

if (options.json) {
  console.log(
    JSON.stringify(
      {
        pi: piText,
        extension: extensionManifest.version,
        parent: PARENT_MODEL,
        invocations: piInvocations,
        rows: rendered,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `pi ${piText}; ${PI_SUBAGENTS_PACKAGE} ${extensionManifest.version}; parent ${PARENT_MODEL}; ${piInvocations} pi invocations; ${new Date().toISOString().slice(0, 10)}`,
  );
  for (const row of rendered) {
    console.log(
      `\n[${row.status}] ${row.control}\n  claim:    ${row.claim}\n  artifact: ${row.artifact}\n  observed: ${row.observed}`,
    );
  }
  console.log(`\nverdict: ${failed ? 'FAIL' : 'PASS'}`);
}
process.exit(failed ? 1 : 0);
