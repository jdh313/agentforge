# Hook event parity — Claude Code ↔ Codex

One row per lifecycle moment. Equivalent events sit in the same row; `—` means
the harness has no event for that moment.

**Headline:** Claude Code and Codex share **11 name-identical** events. Across
that shared core, translation is identity — no renaming, no semantic remapping.
The overlap is **not** a subset in either direction: Claude has 20 events Codex
lacks, and Codex has one Claude lacks (`Interrupt`).

That asymmetry costs the projection nothing today, because AgentForge translates
Claude → Codex and a Codex-only event cannot appear in a Claude `hooks.json`.
`CODEX_HOOK_EVENTS` in `src/capabilities.ts` is therefore correct as written: it
lists what a Claude event may translate *into*, which is a different set from
"every event Codex fires." Recorded here so the next reader does not reconcile
the two counts and conclude one of them is wrong.

Verified 2026-09-17 against **codex-cli 0.154.0** and Claude Code 2.1.274 as
installed on this machine. The 11-event shared core was first established
2026-08-09 against codex-cli 0.147.0 and is unchanged; `Interrupt` is new since
then. See § Evidence for how each column was established and where the
confidence tiers differ.

## Artifact-scoped hooks widen to package scope

Canonical skill and agent `hooks:` declarations compile into separate Codex
package hook files and manifest entries (ndr:pz1x3e). The handler and event
translation below still applies, but activation scope does not survive:

- a Claude skill hook activates only after that skill is invoked; the projected
  Codex hook is active for the whole enabled package;
- a Claude agent hook runs only while that agent is active; the projected Codex
  hook can also fire in the main thread and other agents;
- Claude's agent `Stop` behavior is preserved structurally by projecting it as
  `SubagentStop`; skill-only `once` has no Codex package-hook equivalent and is
  stripped.

The compiler emits a warning for each scope widening. Standalone leaf rendering
still drops artifact hooks because it has no package manifest or honest package
destination. Separate output files preserve source ownership; they do not make
the activation boundary equivalent.

## Shared core — 11 events, identity translation

| Lifecycle moment | Claude Code | Codex | Compiler |
| --- | --- | --- | --- |
| Before a tool call executes | `PreToolUse` | `PreToolUse` | translated |
| A permission decision is needed | `PermissionRequest` | `PermissionRequest` | translated |
| After a tool call completes | `PostToolUse` | `PostToolUse` | translated |
| Before context compaction | `PreCompact` | `PreCompact` | translated |
| After context compaction | `PostCompact` | `PostCompact` | translated |
| A prompt is submitted | `UserPromptSubmit` | `UserPromptSubmit` | translated |
| A subagent is spawned | `SubagentStart` | `SubagentStart` | translated |
| A subagent finishes | `SubagentStop` | `SubagentStop` | translated |
| The response finishes | `Stop` | `Stop` | translated |
| A session begins or resumes | `SessionStart` | `SessionStart` | translated |
| A session terminates | `SessionEnd` | `SessionEnd` | translated |

## Codex-only — no Claude counterpart

New in codex-cli 0.154.0, absent from the 0.147.0 event set.

| Lifecycle moment | Claude Code | Codex | Compiler |
| --- | --- | --- | --- |
| A turn is interrupted | — | `Interrupt` | not reachable |

"Not reachable" rather than "dropped": nothing translates *into* it, because no
Claude event names this moment. It is listed for the evidence record and because
a Codex-authored hook config may carry it. It is deliberately **not** in
`CODEX_HOOK_EVENTS` — that list answers "what may a Claude event become," and
adding an event no Claude event maps onto would make the list answer a different
question than its callers ask.

## Claude-only — confirmed absent from Codex

Listed as `unsupported` in the `codex/hook` capability row, so they report
`unsupported-hook-event`: an **established** absence.

| Lifecycle moment | Claude Code | Codex | Compiler |
| --- | --- | --- | --- |
| A notification is raised | `Notification` | — | dropped, reported |
| A worktree is created | `WorktreeCreate` | — | dropped, reported |
| A worktree is removed | `WorktreeRemove` | — | dropped, reported |

## Claude-only — not yet ruled on

Real Claude events, but the Codex side was never independently verified for
each. They resolve as `unknown` and report `unclassified-hook-event`: "we have
never established this", **not** "we confirmed Codex lacks it". Promote a row to
the section above once verified — do not assume.

| Lifecycle moment | Claude Code | Codex | Compiler |
| --- | --- | --- | --- |
| A permission request is denied | `PermissionDenied` | ? | dropped, reported |
| A tool call fails | `PostToolUseFailure` | ? | dropped, reported |
| A batch of tool calls completes | `PostToolBatch` | ? | dropped, reported |
| A stop attempt fails | `StopFailure` | ? | dropped, reported |
| First-run setup | `Setup` | ? | dropped, reported |
| Instructions are loaded | `InstructionsLoaded` | ? | dropped, reported |
| A prompt is expanded | `UserPromptExpansion` | ? | dropped, reported |
| A message is displayed | `MessageDisplay` | ? | dropped, reported |
| A task is created | `TaskCreated` | ? | dropped, reported |
| A task completes | `TaskCompleted` | ? | dropped, reported |
| A teammate goes idle | `TeammateIdle` | ? | dropped, reported |
| Configuration changes | `ConfigChange` | ? | dropped, reported |
| The working directory changes | `CwdChanged` | ? | dropped, reported |
| A file changes | `FileChanged` | ? | dropped, reported |
| A directory is added | `DirectoryAdded` | ? | dropped, reported |
| An elicitation is raised | `Elicitation` | ? | dropped, reported |
| An elicitation is answered | `ElicitationResult` | ? | dropped, reported |

## Evidence

**Codex column — CONFIRMED, reproducible.** codex-cli 0.154.0 binary,
`HookEventsToml` field set. The same probe against 0.147.0 on 2026-08-09
returned the same set minus `Interrupt`:

```sh
strings -a "$(readlink -f "$(which codex)")" > /tmp/codex-strings.txt
grep -o 'trusted_hash[A-Za-z_]\{0,400\}' /tmp/codex-strings.txt | sort -u
grep -o 'HookEventsToml[A-Za-z]\{0,400\}' /tmp/codex-strings.txt | sort -u
```

At 0.154.0 the maximal hook-context blob reads:

```
PreToolUse PermissionRequest PostToolUse PreCompact PostCompact
SessionStart SessionEnd UserPromptSubmit SubagentStart SubagentStop
Stop Interrupt
```

Shorter blobs are string-interning artifacts of the same set; their union adds
nothing. No thirteenth event appears anywhere in the binary or in `~/.codex/`.

`Interrupt` is a real hook event, not an adjacency artifact: it carries its own
dedicated error strings — `Interrupt hook returned non-JSON stdout`, `hook
returned invalid interrupt hook JSON output`, and `failed to flush transcript
before Interrupt hook`. The trailing `ComputerUseConfigToml` seen in one blob
*is* an adjacency artifact of the next struct and is not an event.

`Notification` is **not** a Codex hook event. It occurs 189 times in the binary,
but only as `HookStartedNotification` / `HookCompletedNotification` — Codex's own
internal IPC types announcing that a hook ran — plus unrelated MCP, UI, and
model-safety payload types. It appears in **zero** hook-context blobs.

**Codex column — a second, independent source now exists.** Codex publishes a
hooks reference at `https://learn.chatgpt.com/docs/hooks` (canonical:
`https://developers.openai.com/codex/hooks`). It is doc-tier evidence retrieved
through a summarizing fetch — the same weak tier as the Claude doc below — but
it was retrieved twice independently and **agrees with the binary** on the event
set and on exit-code semantics (`"Exit 0 with no output is treated as success
and Codex continues"`; `"You can also use exit code 2 and write the blocking
reason to stderr"`). Binary and doc agreeing is what moves these from "probed"
to established. The page also notes hooks are experimental, disabled by default,
and unavailable on Windows.

**Two probe traps.** Both yield a confident wrong answer:

1. `grep -cx` against the binary returns **zero for every event**, including ones
   Codex certainly fires. Rust interns strings into concatenated blobs, so
   nothing is ever alone on a line. Read naively this says "Codex has no hooks."
2. A bare substring count misleads in the other direction — `Notification`'s 189
   hits are almost all unrelated. Only adjacency to `HookEventsToml` /
   `trusted_hash` discriminates.

**Claude column — mixed confidence, and the tiers matter.**

- *Strongest:* `~/.claude/settings.json`, which runs live hooks on `PreToolUse`,
  `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `WorktreeCreate`, and
  `WorktreeRemove`. A live hook is proof the event exists.
- *Official but **stale**:* the plugin-dev cache's `validate-hook-schema.sh`
  hardcodes nine events and omits `SubagentStart`, `PostCompact`, and
  `PermissionRequest`, all of which other evidence confirms. Treat as a lower
  bound, never a ceiling.
- *Corroborating:* third-party plugin `hooks.json` files — `warp` (six events),
  `gitkraken-hooks` (~24, the source of most of the not-yet-ruled-on list).
- *Weakest:* `code.claude.com/docs/en/hooks`, retrieved through a summarizing
  fetch rather than raw HTML. Event **names** are corroborated locally; the
  **descriptions** in this table are paraphrase-level.

The seventeen not-yet-ruled-on events rest largely on that last tier plus one
plugin, which is why they are held separate rather than declared absent.

## Matcher — answered 2026-09-17

This section previously read "Open question," on the grounds that only
`PreToolUse`, `PostToolUse`, and `PermissionRequest` showed matcher-adjacent
evidence in the binary, where `matcher` lives on a shared `HookHandlerConfig` /
`MatcherGroup` struct rather than being tied to event names. That inference was
sound and the conclusion was wrong. The Codex hooks doc settles it.

**`matcher` is honored, and it is a regex.** *"The `matcher` field is a regex
string that filters when hooks fire."* It applies on `PreToolUse`,
`PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SubagentStart`,
`SubagentStop`, and `PermissionRequest` — notably **not** `Stop`, `SessionEnd`,
or `UserPromptSubmit`, which carry no `tool_name` to filter on. Passing
`matcher` through is correct on the eight, and inert rather than wrong on the
rest.

**Codex speaks Claude's tool vocabulary in matchers, by design.** From the
doc's tool coverage table:

| Tool path | Match as |
| --- | --- |
| Shell commands | `Bash` |
| Unified exec (`exec_command`) | `Bash` |
| `apply_patch` | `apply_patch`, `Edit`, or `Write` |
| MCP tools | the MCP tool name, e.g. `mcp__filesystem__read_file` |
| Other local function tools | the function tool name, e.g. `update_plan`; `spawn_agent` also matches `Agent` |
| Hosted tools, such as `WebSearch` | *not matchable — outside the local function-tool hook path* |

The table above is the hooks reference's own claim. Observed on codex-cli
0.160.0, the `spawn_agent` / `Agent` alias does not hold (see `Task` below).

This is why `commit`'s `matcher: "Bash"` fires under Codex even though Codex's
own tools are `shell` / `local_shell` / `exec_command`. Confirmed live against
codex-cli 0.154.0 on 2026-09-17: a Claude-authored `PreToolUse` guard with
`matcher: "Bash"` blocked a destructive command in a real `codex exec` session.

### What survives — detected, not rewritten

The aliasing is deliberate but **not total**. A Claude tool name with no Codex
alias compiles cleanly and matches nothing. The compiler now reports this: the
`codex/hook` capability row carries a tool-name vocabulary (`tools`), and
`translateHookConfiguration` checks each tool name in a group's `matcher`
against it, emitting a warning and leaving the matcher unchanged:

- `unsupported-hook-matcher-tool` — an **established** absence. Listed names:
  `Task`, `Agent`, `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `NotebookEdit`,
  `TodoWrite`. Disposition: lost, undeclared.
- `unclassified-hook-matcher-tool` — a name the row neither lists nor
  prefix-admits (`Frobnicate`). "We have never ruled on this", not "Codex lacks
  it". Disposition: not established. Neither code gates the compile.

The check runs only on the tool events (`PreToolUse`, `PostToolUse`,
`PermissionRequest`); on the other events a matcher filters a session source,
compaction trigger, or agent type, not a tool name. Supported names are `Bash`,
`Edit`, `Write`, `apply_patch`, `update_plan`, `spawn_agent`, and anything
starting `mcp__`. A matcher is split on top-level `|`, an optional leading `^`
and trailing `$` are stripped per alternative, and an alternative is read as a
tool name only when it is `[A-Za-z0-9_]+`. Any other regex syntax (`.*`,
`(Read|Grep)`) is skipped silently (inside a `[...]` class, `(`, `)` and `|`
are literal, not structure). The diagnostic points at the matcher's line in
`hooks.json`, searched only within that event's block, and falls back to the
event key line when the matcher text cannot be found there.

- **`Task`** is the sharpest case, and the hooks reference is wrong about it.
  The hooks reference says `spawn_agent` also matches `Agent`, so `Task` to
  `Agent` looked like a rewrite. A live probe on codex-cli 0.160.0
  ([`docs/reports/codex-spawn-agent-hook-probe.md`](reports/codex-spawn-agent-hook-probe.md))
  found the subagent `tool_name` is `collaborationspawn_agent`, a matcher of
  `Agent` never fired, and the prompt reaches the hook encrypted. `Task` stays a
  reported loss, not a translation.
- `Read`, `Grep`, `Glob`, `WebFetch`, `NotebookEdit`, `TodoWrite` have no listed
  alias; they are listed on that absence, from a summarized-fetch doc.
- `WebSearch` is a hosted tool outside the local function-tool hook path, which
  no projection can fix.

Note also that matchers are **unanchored** regexes: `"Read"` would also match a
tool named `ReadFile`. The doc's own examples anchor (`^Bash$`), and authors
should.

## Failure behavior — observed 2026-10-06

Observed on codex-cli 0.160.0 with a trusted user-level hook and, separately, a
trusted plugin hook from a test plugin (not Commit), `codex exec`, and a harmless
`echo` (`docs/commit-runtime-acceptance.md` gate 5). Every failure of either hook
itself let the command run:

- **Exit 1** — fail-open. Exit 2 blocked (gate 4); exit 1 did not; other codes
  and JSON-output decisions were not tested. The hook's stderr did not reach
  the model.
- **Missing command path** — fail-open, no warning in the `--json` stream,
  stderr, or the model's reply. For the plugin hook the script was renamed away
  (`probe.sh` to `probe.sh.bak`) inside the installed plugin root while `hooks.json` and the trust record stayed as
  they were, and the hook fired again once the script was restored, with no new
  trust step. That this is fail-open rather than a silent untrusted skip rests
  on trust being unaffected during the run, which is inferred for both hooks,
  not observed.
- **Timeout** — a 10 s hook with `timeout: 5` made the exec tool call take 5.1 s
  (plugin hook) and the command ran: the timeout is enforced and non-blocking.
  Codex records no per-hook timing; the tool call's wall time brackets it.

Codex does not fail closed: a hook that cannot run (missing) or overruns its
timeout lets the command through, so a guard can block only by running to
completion and signalling a block (exit 2 observed). The same run showed a `Bash`
`PreToolUse` payload carrying `session_id`, `turn_id`, `transcript_path`, `cwd`,
`hook_event_name`, `model`, `permission_mode`, `tool_name`, `tool_input.command`
and `tool_use_id`, and a user-level hook's environment carrying neither
`PLUGIN_ROOT` nor `CLAUDE_PLUGIN_ROOT` (not evidence about a plugin hook), while a
trusted plugin hook of the test plugin had `PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`,
`PLUGIN_DATA` and `CLAUDE_PLUGIN_DATA` set, the `CLAUDE_*` names carrying the
`PLUGIN_*` values.

## Not an enforcement boundary

Codex states plainly: *"Some specialized tool paths can opt out of the default
hook path. Treat tool hooks as a useful guardrail, not a complete enforcement
boundary."*

A `PreToolUse` guard that blocks reproducibly on the paths tested is not
thereby a security control. Two documented carve-outs already exist — hosted
tools, and `write_stdin` on an existing unified-exec session, which *"doesn't
run `PreToolUse` again when it sends input or polls a command that already
passed `PreToolUse`"*. Anything AgentForge says about hook behavior should
claim reproducible blocking on tested paths, never enforcement.

## Where to look

`src/capabilities.ts` — `CODEX_HOOK_EVENTS`, `CODEX_HOOK_TOOLS`, `toolSupportFor`, and the `codex/hook` row.
`src/targets/codex-marketplace.ts` — `translateHookConfiguration`'s three-way
branch on `supportFor`. `docs/limitations.md` — L-009, the gap this table closes
the evidence side of.
