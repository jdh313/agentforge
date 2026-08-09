# Hook event parity — Claude Code ↔ Codex

One row per lifecycle moment. Equivalent events sit in the same row; `—` means
the harness has no event for that moment.

**Headline:** Codex's 11 events are a strict, **name-identical** subset of
Claude Code's 31. The shared core needs no renaming and no semantic remapping —
translation is identity. Every gap is a Claude-only event.

Verified 2026-08-09 against **codex-cli 0.147.0** and Claude Code as installed
on this machine. See § Evidence for how each column was established and where
the confidence tiers differ.

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

**Codex column — CONFIRMED, reproducible.** codex-cli 0.147.0 binary,
`HookEventsToml` field set:

```sh
strings -a "$(readlink -f "$(which codex)")" > /tmp/codex-strings.txt
grep -o 'trusted_hash[A-Za-z_]\{0,400\}' /tmp/codex-strings.txt | sort -u
grep -o 'HookEventsToml[A-Za-z]\{0,400\}' /tmp/codex-strings.txt | sort -u
```

The maximal hook-context blob is exactly the eleven events above. Shorter blobs
are string-interning artifacts of the same set; their union adds nothing. No
twelfth event appears anywhere in the binary or in `~/.codex/`.

`Notification` is **not** a Codex hook event. It occurs 189 times in the binary,
but only as `HookStartedNotification` / `HookCompletedNotification` — Codex's own
internal IPC types announcing that a hook ran — plus unrelated MCP, UI, and
model-safety payload types. It appears in **zero** hook-context blobs.

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

## Open question

Whether Codex honors `matcher` on non-tool events is **unestablished**. In the
binary, `matcher` lives on a shared `HookHandlerConfig` / `MatcherGroup` struct
rather than being tied to specific event names, and only `PreToolUse`,
`PostToolUse`, and `PermissionRequest` show matcher-adjacent evidence. The
translator passes `matcher` through for every event, so if Codex ignores it on,
say, `SessionStart`, the compiler emits a field that silently does nothing.

## Where to look

`src/capabilities.ts` — `CODEX_HOOK_EVENTS` and the `codex/hook` row.
`src/targets/codex-marketplace.ts` — `translateHookConfiguration`'s three-way
branch on `supportFor`. `docs/limitations.md` — L-009, the gap this table closes
the evidence side of.
