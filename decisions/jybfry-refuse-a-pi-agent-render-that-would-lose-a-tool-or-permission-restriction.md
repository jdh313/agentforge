---
id: "jybfry"
title: Refuse a Pi agent render that would lose a tool or permission restriction
status: current
decision_date: 2026-10-08
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/targets/pi.ts
  - src/cli.ts
supersedes:
  - yvgjpt
superseded_by: []
derived_from:
  - "Fibery Project Tracking/Task #139 (Pi agents: leaf agent render),
    correctness review finding: plan-mode agent renders with all tools"
informed_by:
  - az33k6
  - bqyqfd
  - 2pmgn1
  - 2vv99y
---

# jybfry — Refuse a Pi agent render that would lose a tool or permission restriction

## Decision

When a canonical agent sets a non-empty shared `tools` or `disallowedTools`, or any `permissionMode` other than `bypassPermissions`, and supplies no `targets.pi.tools`, the Pi agent projection refuses to render it rather than emit an agent that runs with more tools, or fewer checks, than its source allows.

## Scope

- Binds: Pi leaf agent render and install, including `--all-targets` runs, which report the refusal as a skip.
- Does not bind: Codex, where ndr:bqyqfd keeps tool and permission policy as reported losses.

## Commitments

- An author who wants a restricted Pi agent writes `targets.pi.tools` in Pi tool names; that override satisfies the gate for all three keys, which are still reported as keys Pi does not accept.
- An empty `disallowedTools` list restricts nothing and does not trigger the gate.
- The refusal names the agent, every restricting key, and the missing override.

## Revisit if

- The extension, or core Pi, gains a tool denylist or a permission prompt that can carry these keys.
- A supported Pi permission package becomes part of the Pi target's projection.

## Context

- The Pi agent loader treats an omitted `tools` as all seven built-in tools.
- The loader has no denylist and no permission mode, and silently ignores unread keys.
- Pi runs every tool an agent has without asking; nothing in the loader gates or denies a call.
- `permissionMode: plan` is read-only on Claude, and every mode except `bypassPermissions` asks before or denies at least some tool calls.
- ndr:yvgjpt gated only `tools` and `disallowedTools`, so a plan-mode agent with no tool list rendered for Pi with all built-in tools.

## Why

A permission mode restricts what an agent can do just as a tool list does, and Pi's lack of any ask-or-deny step means every mode except `bypassPermissions` loses that restriction on Pi. Leaving modes outside the gate kept the exact widening the gate exists to prevent: a plan-mode agent becomes a write-capable one. The line is drawn at the operation Pi lacks, not at which modes feel restrictive, so `bypassPermissions` passes because it is the one mode whose meaning Pi already has. A Pi tool allowlist remains the single escape hatch, because it is the one restriction the loader enforces.

## Alternatives

- **Keep permissionMode a reported loss** — rejected: a plan-mode agent renders write-capable, the widening the gate exists to prevent.
- **Refuse only `plan`** — rejected: `default`, `acceptEdits`, `dontAsk` and `manual` also gate calls Pi would run unasked, and naming one mode is a judgment about intent rather than about what Pi can express.
- **Map modes to a synthesized Pi allowlist** — rejected: invents tool policy no author wrote, the objection that ruled out a tool-name map.
