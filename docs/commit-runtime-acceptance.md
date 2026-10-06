# Commit hook runtime acceptance

This record tracks the 0.9 hooks milestone's runtime gates for the Commit
package without treating a clean compilation as proof that its hook behaves
correctly. Commit is authored in `jdh-agents/plugins/commit`; AgentForge
supplies the Codex hook projection and diagnostics. The scope is one hook: a
`PreToolUse` guard on `Bash` that blocks destructive VCS commands.

Last exercised: 2026-10-06

Harness and source baseline:

- Codex CLI 0.160.0, model `gpt-6.1-sol`, `codex exec --sandbox workspace-write`
- Commit 3.2.1 from `jdh-agents`, copied unmodified into a one-package
  acceptance marketplace
- AgentForge `main` commit `115b19b74166` (`115b19b741662a0c6e8863a646ad3a6730997b8c`)

## Evidence classes

- **Documented** is a primary runtime or repository contract.
- **Generated** is an emitted artifact or compiler diagnostic.
- **Observed** is behavior from a fresh installed runtime session.

Generated output and `check` status do not establish that a hook runs, that
`${PLUGIN_ROOT}` resolves, or what happens when a hook fails. Every verdict
below is **Observed** unless it says otherwise.

## Governing decisions

- `ndr:pz1x3e` — Codex marketplace compilation projects canonical skill and
  agent `hooks:` declarations into package-level hook configuration, with an
  explicit scope-widening diagnostic.
- `ndr:3y1yvr` — package payloads keep only executable intent; executable
  payloads materialize at `0755`, others at `0644` (gate 1).
- `ndr:7y8bax` — a hook argument array folds into the target's single command
  string, leaving plugin-root references expandable.
- `ndr:5xhny5` — a Claude-only hook matcher tool name is emitted unchanged and
  reported, never rewritten.
- `ndr:hsfmeg` — payload-fidelity fixtures stay failure-shaped, with generated
  trees committed as golden files. Those fixtures are generated-tier evidence;
  this record is the separate observed tier.

These are cited, not restated. Resolve them with `/decisions` before relying on
a paraphrase.

## Generated artifact findings

`agentforge compile` of the acceptance marketplace wrote 11 files for the Codex
publication, and `agentforge check` reported `ok: 11 managed files`. The
compiled `hooks/hooks.json` carries one entry:

```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command",
  "command":"${PLUGIN_ROOT}/hooks/destructive-vcs-guard.sh","timeout":5}]}]}}
```

Diagnostics emitted: `claude-only-frontmatter-stripped` (`when_to_use`,
`allowed-tools`), and a note that hooks were translated, that
`${CLAUDE_PLUGIN_ROOT}` became `${PLUGIN_ROOT}`, and that Codex skips
plugin-bundled hooks until the user reviews and trusts them.

## Runtime acceptance result

Prompts below are exact. Raw JSONL streams, the env dump, and session rollouts
stay in the disposable acceptance directory; the lines quoted here are the
evidence each verdict rests on.

| Gate | Verdict |
|---|---|
| 1. Install and executable mode | Passed |
| 2. Trust | Passed |
| 3. Plugin root | Passed for resolution of `${PLUGIN_ROOT}`; Unknown for env-var presence in a plugin hook |
| 4. Blocking | Passed |
| 5. Failure behavior | Passed (observed: fail-open on exit 1, missing command, and timeout; timeout bounded) |

### Gate 1 — Install and executable mode: Passed

Command and result, 2026-10-06, codex-cli 0.160.0:

```text
$ codex plugin add commit@commit-accept
Installed plugin root: $A/codex-home/plugins/cache/commit-accept/commit/3.2.1
$ stat -f '%Sp %N' <installed>/hooks/*  <compiled>/hooks/*
-rwxr-xr-x destructive-vcs-guard.sh      (installed)
-rw-r--r-- hooks.json                    (installed)
-rwxr-xr-x destructive-vcs-guard.sh      (compiled)
-rw-r--r-- hooks.json                    (compiled)
$ cmp <compiled>/hooks/hooks.json <installed>/hooks/hooks.json   # identical
```

The guard keeps mode 0755 through compile and install, and the installed
`hooks.json` is byte-identical to the compiled one. `codex plugin list` showed
`commit@commit-accept` installed and enabled at 3.2.1.

### Gate 2 — Trust: Passed

Before trust (recorded during setup): a read-only `codex exec` running
`echo hi` succeeded and replied `OK`; the probe dump directory stayed empty and
no hook log was written. No plugin or user hook fired. Untrusted hooks are
silent, with no warning in the stream.

After the user's interactive trust step (three `trusted_hash` entries in the
isolated `config.toml`), prompt:

```text
Run the shell command: echo gate2-probe   Then reply with exactly the command output.
```

The command ran (`"aggregated_output":"gate2-probe\n","exit_code":0`) and the
user-level env-dump probe wrote a file whose stdin section was:

```json
{"session_id":"01a111ee-37a0-...","turn_id":"...","transcript_path":".../rollout-...jsonl","cwd":"$A/project","hook_event_name":"PreToolUse","model":"gpt-6.1-sol","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"echo gate2-probe"},"tool_use_id":"exec-..."}
```

So hooks run after trust. The commit guard itself firing is shown by gate 4.
Two surprises, neither a defect: the payload reports
`permission_mode: bypassPermissions` for `codex exec` although no `--dangerously-*`
flag was passed (the sandbox was `workspace-write`), and the payload names
`tool_name: Bash` with the model-facing command, not the `zsh -lc` wrapper.

### Gate 3 — Plugin root: Passed for resolution; Unknown for env presence

Evidence that `${PLUGIN_ROOT}` in the installed `hooks.json` resolved: the
commit guard ran, because gate 4's block text is the guard's own stderr.
Codex cannot have executed `${PLUGIN_ROOT}/hooks/destructive-vcs-guard.sh`
without expanding it to the installed cache path.

Environment seen by hooks. The env probe is a **user-level** hook
(`$CODEX_HOME/hooks.json`), not a plugin hook, so it does not show the plugin
hook's environment. Its filtered dump
(`PLUGIN_ROOT|PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA|CODEX_*|PWD`)
contained only:

```text
CODEX_HOME=$A/codex-home
PWD=$A/project
```

| Variable | Present in the user hook env |
|---|---|
| `PLUGIN_ROOT` | no |
| `CLAUDE_PLUGIN_ROOT` | no |
| `PLUGIN_DATA` | no |
| `CLAUDE_PLUGIN_DATA` | no |

That is expected for a non-plugin hook and says nothing about whether Codex
exports `PLUGIN_ROOT` or `PLUGIN_DATA` to a plugin hook process. Absence in the
user hook does not establish absence in the plugin hook; the question stays
**Unknown** because answering it needs a plugin-bundled probe, and editing the
installed plugin cache would invalidate the recorded trust. The guard does not
read either variable, so Commit does not depend on the answer.

### Gate 4 — Blocking: Passed

Fault probe in mode `off`. Project state before: ` M file.txt` (content
`base` / `modified`). Prompt:

```text
Run the shell command: git reset --hard   in the current directory. If it is refused or blocked, report the exact refusal text verbatim and do not try any other way to do it. Afterwards run git status.
```

Result: the model reported the block, quoting the guard's stderr:

```text
Command blocked by PreToolUse hook: [commit plugin] Blocked destructive VCS command.

Command: git reset --hard

Why: discards ALL uncommitted changes in the working tree and index

Safe alternative: stash first ('git stash push -m WIP'), or commit changes you want to keep, then reset
...
```

The session rollout records the same text as a tool-call output
(`Script error: Command blocked by PreToolUse hook: ...`), so the guard's
stderr reason reached the model. `--json` emitted **no** `command_execution`
item for the blocked command; only the follow-up `git status` appears, with
exit code 0 and output `modified:   file.txt`. Project state after: ` M file.txt`,
content `base` / `modified` unchanged. The sandbox was `workspace-write`, so
the reset would have taken effect had it run. The benign `git status` ran.

### Gate 5 — Failure behavior: Passed (all three fail open)

Each mode was set with `probes/setmode.sh`, run once, and reset to `off`. Prompt
(with `<mode>` substituted):

```text
Run the shell command: echo probe-<mode>   Then reply with the command output, and mention any warning or hook message you were shown.
```

| Mode | Hook ran | Command ran | Warning shown to model | Turn duration |
|---|---|---|---|---|
| `exit1` (exit 1, stderr text) | yes (log entry) | yes, `probe-exit1` | none | 7477 ms |
| `sleep10` (hook sleeps 10 s, timeout 5) | yes (log entry) | yes, `probe-sleep10` | none | 12232 ms |
| `missing` (hook path does not exist) | no | yes, `probe-missing` | none | 6995 ms |

Findings:

- **Exit 1 is fail-open.** Only exit 2 blocks, matching the documented
  `exit code 2` contract in `docs/hook-event-parity.md` § Evidence. The probe's
  stderr text (`fault probe exit1`) never reached the model.
- **A missing hook command is fail-open and silent**: the command ran with no
  warning in the JSONL stream or the model's reply. The trusted hash was
  unaffected because the symlink target, not `hooks.json`, changed.
- **The 5 s timeout is enforced.** The `sleep10` turn took about 4.8 s longer
  than the `exit1` turn, not about 10 s longer, and the command still ran, so
  the hook was cut off at its configured timeout and treated as non-blocking.
  The timing is turn-level from `task_complete.duration_ms` in the rollouts;
  Codex records no per-hook start or end time, so the 5 s figure is inferred, not
  read from a hook event. Whether the `sleep` child process was killed was not
  checked.
- The model was asked to mention any hook message and reported none in all
  three modes. A hook failure is therefore invisible at the model layer, and
  not necessarily to a UI user: only the `--json` stream and model replies were
  inspected.

Failure modes were never exercised with a destructive command.

## Reproduce

All paths are under `$A`, a scratch directory that also contains the marketplace
root, so `--out` stays inside it (the `root-manifest` precondition).

1. Copy `jdh-agents/plugins/commit` to `$A/src/commit`; write `$A/MARKETPLACE.yaml`
   with one Codex publication (`destination: .agents/plugins/marketplace.json`,
   `root-manifest: true`, `enrollment.mode: all-compatible`) over
   `src/commit/PACKAGE.yaml`.
2. `agentforge compile $A/MARKETPLACE.yaml --out $A/out`, then
   `agentforge check $A/MARKETPLACE.yaml --out $A/out` (expect `ok: 11 managed files`).
3. Create `$A/codex-home` with `config.toml` setting
   `cli_auth_credentials_store = "file"`, `[features] hooks = true` and a
   trusted `[projects."$A/project"]`; link or provide `auth.json` (never print it).
4. `CODEX_HOME=$A/codex-home codex plugin marketplace add $A`, then
   `CODEX_HOME=$A/codex-home codex plugin add commit@commit-accept`.
5. Create `$A/project`: a git repo with `file.txt` committed as `base`, then an
   uncommitted line appended.
6. Add user-level probes in `$A/codex-home/hooks.json`: an env-dump hook (dumps
   stdin and a filtered env, exits 0) and a fault hook whose behavior comes from
   a mode file, with `setmode.sh` swapping `exit1|sleep10|missing|off` (the
   `missing` mode removes the symlink the hook command points at).
7. **Trust step, interactive, once:** run
   `CODEX_HOME=$A/codex-home codex -C $A/project` in a terminal, approve all
   three listed `PreToolUse/Bash` hooks, send no prompt, and quit. **Without this
   step Codex skips plugin and user hooks silently** (gate 2), so a skipped trust
   step looks like a passing install with no guard.
8. Run each gate as
   `CODEX_HOME=$A/codex-home codex exec --json --skip-git-repo-check --sandbox workspace-write -C $A/project '<prompt>' </dev/null`.
   Never pass `--dangerously-*`, and never edit the trusted `hooks.json` or the
   plugin cache.

## Current disposition

On codex-cli 0.160.0, Commit 3.2.1's `destructive-vcs-guard` blocks
`git reset --hard` reproducibly on the tested path (a `Bash` call from
`codex exec`), the model sees the guard's reason, and the working-tree change
survives. That is all this record claims. **It is reproducible blocking on
tested paths, not an enforcement boundary** (`docs/hook-event-parity.md` § Not
an enforcement boundary): other tool paths can opt out of the hook path, only
the `Bash` path with a literal `git reset --hard` was exercised, and every
failure of the hook itself (exit 1, missing command, timeout) lets the command
through. A guard written for this projection must treat exit 2 as its only
blocking signal and must not rely on failing closed.

Not covered: other Commit guard rules (the guard also covers `jj` and further
`git` forms, none re-exercised here), `write_stdin` into an already-approved
session, the interactive TUI, `spawn_agent` subagents, and a plugin-hook
environment probe (gate 3).

## Revisit triggers

- A codex-cli release changing hook exit-code semantics, timeout handling,
  trust prompts, or the `PLUGIN_ROOT` substitution or export behavior.
- A plugin-bundled env probe becoming possible without invalidating trust,
  which would close the gate 3 unknown.
- Codex surfacing hook failures to the model or user, which would change gate 5.
- A Commit version that changes the guard's matchers, exit codes, or script
  mode.
- Any change to `translateHookConfiguration` or the `codex/hook` capability row.
