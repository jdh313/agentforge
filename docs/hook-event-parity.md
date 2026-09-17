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

This is why `commit`'s `matcher: "Bash"` fires under Codex even though Codex's
own tools are `shell` / `local_shell` / `exec_command`. Confirmed live against
codex-cli 0.154.0 on 2026-09-17: a Claude-authored `PreToolUse` guard with
`matcher: "Bash"` blocked a destructive command in a real `codex exec` session.

### What survives — narrower, and deferred

The aliasing is deliberate but **not total**. A Claude tool name with no Codex
alias compiles cleanly and matches nothing:

- **`Task`** is the sharpest case. Claude's subagent tool is `Task`; Codex
  aliases `spawn_agent` to **`Agent`**. `matcher: "Task"` therefore never fires
  under Codex while looking entirely correct.
- `Read`, `Grep`, `Glob`, `WebFetch`, `NotebookEdit`, `TodoWrite` have no listed
  alias either.
- Hosted tools are outside the hook path, which no projection can fix.

Detecting this needs a per-`(target, surface)` **tool-name vocabulary** — the
matcher analogue of what `CODEX_HOOK_EVENTS` does for event names. The
capability table carries token lists, not vocabulary mappings, so this is a
table-shape change rather than a row addition, and it is recorded here rather
than detected. Until it exists, a matcher naming a Claude-only tool is a silent
no-op on Codex.

Note also that matchers are **unanchored** regexes: `"Read"` would also match a
tool named `ReadFile`. The doc's own examples anchor (`^Bash$`), and authors
should.

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

`src/capabilities.ts` — `CODEX_HOOK_EVENTS` and the `codex/hook` row.
`src/targets/codex-marketplace.ts` — `translateHookConfiguration`'s three-way
branch on `supportFor`. `docs/limitations.md` — L-009, the gap this table closes
the evidence side of.
