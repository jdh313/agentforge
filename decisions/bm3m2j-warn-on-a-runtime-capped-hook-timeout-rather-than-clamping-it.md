---
id: "bm3m2j"
title: Warn on a runtime-capped hook timeout rather than clamping it
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - git:5192aad
informed_by:
  - 2vv99y
---

# bm3m2j — Warn on a runtime-capped hook timeout rather than clamping it

## Decision

When a declared hook timeout exceeds a documented runtime cap, emit a warning naming the cap and emit the declared value unchanged. Do not clamp the value and do not fail compilation.

## Scope

- Binds: declared hook timeouts that exceed a target's documented per-event cap.
- Does not bind: values the target rejects outright rather than caps.

## Commitments

- Name both the declared value and the cap in the diagnostic.
- Emit the author's declared value into generated output.

## Revisit if

- An enrolled package actually ships a hook on the capped event, where a silently capped timeout could matter.
- A target begins rejecting an over-cap value instead of capping it.

## Context

- The target documents a per-event timeout cap and enforces it itself at runtime.
- No enrolled package currently ships a hook on the capped event.
- The declared value is the author's stated intent, not a mistake.

## Why

The runtime already enforces the limit, so rewriting the value buys nothing and costs fidelity: generated output would stop matching what the author declared, and a later reader could not tell whether the lower number was intended. A warning puts the discrepancy in front of whoever compiles without the compiler editing an author's declaration on their behalf. Failing outright would be disproportionate to a limit the runtime handles gracefully.

## Alternatives

- **Clamp the emitted value to the cap** — rejected: rewrites a declared value on the author's behalf and hides the discrepancy.
- **Fail compilation** — rejected: disproportionate for a limit the runtime already enforces.
