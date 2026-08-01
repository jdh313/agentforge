---
id: "e9jc29"
title: Make body constructs declarable, not warning-only
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - https://linear.app/junglelan/issue/JUN-353/agentforge-finish-the-claude-only-construct-detection-surface
informed_by:
  - 4nshwv
  - rm06pf
---

# e9jc29 — Make body constructs declarable, not warning-only

## Decision

Constructs found in an artifact body carry declarable construct names alongside frontmatter constructs, so any confirmed silent loss can be recorded as a disposition regardless of where it was found.

## Scope

- Binds: the vocabulary of declarable Claude-only constructs.
- Does not bind: which constructs are confirmed losses, which the capability table decides.

## Commitments

- Adding a construct name is an additive schema change; existing declarations stay valid.
- Where a construct was found never determines whether it can be declared.

## Revisit if

- The construct vocabulary grows past the point where an author can choose the right name.
- A body construct needs a disposition value the current set cannot express.

## Context

- Body constructs and frontmatter constructs were previously detected by two separate mechanisms with different severities.
- The body mechanism emitted a warning and offered no way to record a decision about what it found.
- The governing decision requires a disposition precisely where a construct's meaning is lost with nothing reported.
- A body construct with no target equivalent is exactly such a loss.

## Why

The old split made declarability an accident of detection mechanism rather than a property of the construct. A body feature that vanished silently was, by the governing rule, the case that most needed a declaration, and it was the one case that could not have one. Unifying the vocabulary removes a rule the model could state but not honor.

Keeping the addition purely additive matters more than the naming: packages already carrying declarations must not be broken by a surface that grew, or the growth becomes a reason to avoid the gate.

## Alternatives

- **Leave body constructs warning-only** — rejected: leaves the one case the governing rule targets unable to comply with it.
- **A separate declaration surface for body constructs** — rejected: two surfaces for one concept reproduces the split being removed.
