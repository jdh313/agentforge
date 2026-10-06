---
id: "5xhny5"
title: Report Claude-only hook matcher tool names instead of rewriting them for Codex
status: current
decision_date: 2026-10-06
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - scope
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - docs/reports/codex-spawn-agent-hook-probe.md
  - jj nnsyzttq, uknnxuwy
informed_by:
  - 61cmc9
  - pz1x3e
---

# 5xhny5 — Report Claude-only hook matcher tool names instead of rewriting them for Codex

## Decision

During Codex marketplace compilation, a hook matcher naming a Claude tool Codex does not expose is emitted unchanged and reported as `unsupported-hook-matcher-tool`, or `unclassified-hook-matcher-tool` when the name is unlisted. Neither warning gates compilation, and no matcher is rewritten to a Codex tool name.

## Commitments

- A future matcher translation needs its own translated entry on the `codex/hook` row, backed by evidence that both the match and the hook's input survive (ndr:61cmc9).

## Revisit if

- Codex's subagent tool becomes matchable as `Agent` and its hook input exposes the task prompt.
- A Claude tool gains a Codex equivalent whose hook input carries the same fields a Claude hook reads.

## Context

- Codex's hooks reference documents `spawn_agent` as also matching `Agent`, which made `Task` → `Agent` look like a one-line rewrite.
- A live codex-cli 0.160.0 probe showed the subagent `tool_name` is `collaborationspawn_agent`, an `Agent` matcher never fired, and its `tool_input` carries `task_name`, an encrypted `message`, and `fork_turns`.
- Claude's `Task` input carries `subagent_type`, `prompt`, and `description`.
- Shell calls reach Codex hooks in Claude's exact shape (`Bash`, `tool_input.command`).

## Why

A matcher rewrite only helps if the hook then fires on the same action with input it can read. For `Task` neither holds: the documented alias does not match the observed tool name, and the field a `Task` hook inspects is encrypted before the hook runs, so no wrapper can recover it. Rewriting would turn a reported loss into a silent one that looks translated. Reporting keeps the loss visible without gating packages whose hooks are otherwise sound.

## Alternatives

- **Rewrite `Task` to `Agent`** — rejected: the rewritten matcher never fires on 0.160.0.
- **Compiler-generated wrapper that reshapes Codex hook input into Claude's** — rejected: the prompt is encrypted, so there is nothing to reshape into `prompt`, and the wrapper needs an interpreter guaranteed on every machine.
- **Gate compilation on an unsupported matcher name** — rejected: a matcher that matches nothing is inert, not harmful, and unsupported hook events already warn rather than gate.
