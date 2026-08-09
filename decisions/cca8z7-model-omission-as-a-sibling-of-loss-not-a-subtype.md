---
id: "cca8z7"
title: Model omission as a sibling of loss, not a subtype
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - CONTEXT.md
  - docs/limitations.md
supersedes: []
superseded_by: []
derived_from:
  - .docs/2026-08-09-compilation-report-companion.md decision-log row 3
informed_by:
  - 4nshwv
---

# cca8z7 — Model omission as a sibling of loss, not a subtype

## Decision

Omission and loss are sibling concepts, not one nested inside the other. A loss
is construct-scoped and carries a state; an omission is a source file or
declaration absent from output with no diagnostic naming it, and carries neither
a construct nor a state.

## Scope

- Binds: the vocabulary in `CONTEXT.md` and any diagnostic or report that
  distinguishes the two.
- Does not bind: how omissions are detected. Nothing detects them today.

## Commitments

- A report or diagnostic surface that covers loss must say whether it covers
  omission, because the two are no longer readable as one category.
- Any future omission-reporting work needs its own detection path; the construct
  scanner cannot be extended to reach it.

## Revisit if

- Omissions gain a construct-like identity that could carry a state.
- The `State` field stops being attached to loss.

## Context

- `Loss` is defined as a construct whose meaning does not survive to a target,
  and every loss carries a `State` of `stripped` or `retained-unenforced`.
- L-007 records a different failure: a source file the compiler does not carry,
  producing no warning, note, or diagnostic at all.
- An omitted file has no construct, so there is nothing for a state to describe,
  and the thing missing may be a whole file rather than a frontmatter key.
- The compiler reports lossy translation thoroughly and lossy omission not at
  all, so the two also differ in whether anything observes them.

## Why

The `State` relationship is what forced the call. A state describes what became
of a construct, and it hangs off loss by definition — so widening loss to cover
whole files would leave a subset of losses that structurally cannot have a
state, breaking the one invariant the concept carries.

The failure modes also differ in kind rather than degree. A loss is reported and
may be declared; an omission is unreported *by definition* — that silence is the
defining property, not an incidental gap. Collapsing them would make "declared
loss" ambiguous about whether an undeclared omission was a violation.

## Alternatives

- **Omission as a subtype of loss** — rejected: both are "something in source
  absent from output", but the subtype would violate loss's state invariant and
  make the declared-loss rule ambiguous.
- **No separate term, describe it case by case** — rejected: L-007 needed the
  distinction three times in one entry, and prose paraphrase is what let the gap
  go unnamed for as long as it did.
