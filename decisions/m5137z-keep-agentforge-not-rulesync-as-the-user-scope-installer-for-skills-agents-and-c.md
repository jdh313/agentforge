---
id: "m5137z"
title: Keep agentforge, not rulesync, as the user-scope installer for skills,
  agents and commands
status: current
decision_date: 2026-10-05
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - tooling
  - write-side
  - substrate
binds: []
supersedes: []
superseded_by: []
derived_from:
  - ~/rulesync-trial/REPORT.md (sandboxed rulesync v24.0.0 trial, 2026-10-05)
  - ~/rulesync-trial/VERIFY.md (independent re-test of four findings)
informed_by:
  - hjnabw
  - f1s7gm
---

# m5137z — Keep agentforge, not rulesync, as the user-scope installer for skills, agents and commands

## Decision

If plugins stop being the distribution unit for skills, agents and commands, agentforge remains the tool that renders and installs them at user scope. rulesync is not adopted as the generation or installation layer.

## Scope

- Binds: user-scope installs into `~/.claude`, `~/.codex`, `~/.agents`, `~/.config/opencode` and `~/.pi`.
- Does not bind: whether to drop plugins at all; that is undecided.
- Does not bind: borrowing individual rulesync ideas (Codex `openai.yaml` policy mapping, Pi hook extension design) into agentforge.

## Commitments

- OpenCode agents and commands on OpenCode, Pi and Codex stay unavailable until agentforge projects them.
- User-scope installs keep relying on agentforge's planned-path ownership and `check-install`.

## Revisit if

- rulesync reports per-field frontmatter drops during generate.
- rulesync tracks which user-scope files it owns, so `--delete` and MCP generation leave hand-written content alone.
- agentforge's user-scope maintenance cost exceeds the value of its loss reporting and ownership checks.

## Context

- Dropping plugins in favor of plain user-scope installs was under consideration.
- rulesync v24.0.0 generates skills, agents, commands, hooks and MCP for Claude Code, Codex, OpenCode and Pi from one `.rulesync` tree.
- In a sandboxed trial, rulesync dropped Codex agent `model`/`tools`/`maxTurns` and command `allowed-tools` with no warning, and no `--verbose`, `--json` or `doctor` mode reports such drops.
- Every rulesync generate with the `mcp` feature replaced the whole MCP server set in `~/.claude.json`, `~/.codex/config.toml` and `opencode.jsonc`, deleting hand-written servers.
- By default rulesync replaced the whole hook list in `~/.claude/settings.json` and `~/.codex/hooks.json`; `preserveUnownedHooks: true` keeps hand-written hooks.
- `generate --delete` deleted every hand-written skill, agent and command in the shared user directories.
- A plain generate wrote through the symlinked `~/.codex/agents` into the dotfiles repo without warning.
- Skills rendered identically to agentforge on all four targets.

## Why

The silent field drops decide it. agentforge's loss reporting exists so that a value lost on one harness is either declared or warned about; rulesync loses the same values with no signal, and only authoring every value again under per-harness blocks avoids it, with nothing to catch an omission.

User scope makes ownership the second deciding factor. Those directories hold hand-written and other-tool content beside generated content. rulesync either replaces shared files wholesale (MCP, hooks by default) or sweeps everything it did not produce (`--delete`). Its safe configuration — exclude `mcp`, set `preserveUnownedHooks`, never `--delete`, remove stale files by hand — gives up its own cleanup and still writes into dotfiles silently. agentforge already owns only the paths it planned and refuses cross-target collisions, which is the property user scope needs.

The wider target catalog (OpenCode agents, commands on more harnesses) is real but smaller than either loss.

## Alternatives

- **Adopt rulesync with guardrails** (`preserveUnownedHooks`, `mcp` excluded, never `--delete`, manual stale-file cleanup) — verdict: rejected: keeps the silent field drops and silent dotfiles writes, and gives up deletion of removed packages.
- **rulesync for rendering only, agentforge for packaging** — verdict: rejected: moot once plugins are dropped, and the silent drops apply to rendering itself.
