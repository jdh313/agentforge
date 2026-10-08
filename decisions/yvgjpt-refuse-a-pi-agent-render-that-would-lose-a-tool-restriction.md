---
id: "yvgjpt"
title: Refuse a Pi agent render that would lose a tool restriction
status: superseded
decision_date: 2026-10-08
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/targets/pi.ts
  - src/render.ts
supersedes: []
superseded_by:
  - jybfry
derived_from:
  - "Fibery Project Tracking/Task #138 (Pi agents: decide to target
    @gotgenes/pi-subagents and its field mapping)"
informed_by:
  - bqyqfd
  - 2pmgn1
  - 2vv99y
---

# yvgjpt — Refuse a Pi agent render that would lose a tool restriction

## Decision

When a canonical agent sets a shared `tools` or `disallowedTools` and supplies no `targets.pi.tools`, the Pi agent projection refuses to render it, rather than stripping the restriction and emitting an agent that runs with more tools than its source allows.

## Scope

- Binds: Pi leaf agent render and install, including `--all-targets` runs, which report the refusal like any unsupported pair.
- Does not bind: Codex, where ndr:bqyqfd keeps tool and permission policy as reported losses.
- Does not bind: `permissionMode`, which stays a reported loss on Pi.

## Commitments

- An author who wants a restricted Pi agent writes `targets.pi.tools` in Pi tool names.
- A `targets.pi.tools` override satisfies the gate even when a shared `disallowedTools` remains; the override is taken as the author's Pi restriction.
- The refusal names the agent, the restricting key, and the missing override.

## Revisit if

- The extension, or core Pi, gains a tool denylist that can carry `disallowedTools`.
- A supported Pi permission package becomes part of the Pi target's projection.

## Context

- The Pi agent loader treats an omitted `tools` as all seven built-in tools.
- The loader has no denylist, and silently ignores an unread `disallowedTools`.
- A shared `tools` written in Claude names cannot pass through, since the loader matches tool names exactly and the Pi target takes `tools` only from its override.
- ndr:bqyqfd accepts tool and permission policy as reported losses on Codex.

## Why

A tool restriction is a safety property, and losing it widens what the agent can do; every other loss on this target only narrows or degrades behavior. A diagnostic alone leaves a file on disk that Pi loads and runs with full built-in tools, and nothing at runtime reveals the gap, so the warning is the only line of defense and it is easy to miss in a batch render. Refusing makes the author choose the Pi restriction explicitly, which costs one override per restricted agent. The user chose this over strip-and-warn even though it departs from the Codex precedent, judging that a reported widening is still a widening.

## Alternatives

- **Strip and warn** — rejected: the agent renders with all built-in tools, a silent capability widening at runtime.
- **Translate Claude tool names through a map** — rejected: puts a vendor tool dialect in shared code, and still cannot express `disallowedTools`.
- **Synthesize an allowlist as built-ins minus denied names** — rejected: converts a denylist into an allowlist that silently drops extension and MCP tools.
