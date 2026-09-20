---
id: "7r7n44"
title: Classify gated support after settled non-losses
status: current
decision_date: 2026-09-20
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - read-side
  - architecture
binds:
  - src/report.ts
supersedes:
  - hv9kbf
superseded_by: []
derived_from:
  - "Fibery #123"
informed_by:
  - q3b191
  - bqh2gz
  - 71jgk2
---

# 7r7n44 — Classify gated support after settled non-losses

## Decision

A diagnostic whose outcome depends on an explicit capability condition resolves to the `gated` disposition. On the report scale it follows `nothing-to-carry` and precedes `not-established`, regardless of which typed gate condition produced it.

## Scope

- Binds: report disposition vocabulary, code-to-disposition classification, ordering, labels, and serialized report values.
- Does not bind: which capability rows are gated, the gate condition schema, or how an emitter words a condition.

## Commitments

- Every diagnostic that reports conditional support maps to `gated`; condition mechanisms do not create separate report buckets by default.
- The total code-to-disposition record handles the new member in the same change as any gated diagnostic code.
- Report consumers must treat `gated` as an actionable but unresolved outcome, not as a carried result or an absence of classification.
- The report schema version advances when the new serialized disposition can appear.

## Revisit if

- Two gate conditions differ enough in reader action or certainty to require separate report buckets.
- A gated outcome and `nothing-to-carry` prove indistinguishable to report readers.
- Reports begin carrying evaluation context that resolves every emitted gate before classification.

## Context

- The preceding decision covered configuration gating, was tentative, and had only one hypothetical support mechanism in view.
- The report scale orders confirmed losses first and unknown outcomes last.
- A later decision added `nothing-to-carry` for a fully established no-op and deliberately left its position relative to conditional support open.
- The diagnostic code space and its disposition mapping are closed and total at the type level.
- The first install-scope diagnostic is temporarily classified as `carried-unenforced`, although it reports a named condition rather than a carry guarantee.

## Why

The scale measures what the compile established. `nothing-to-carry` is settled: the compiler knows there was no construct to carry or lose. A gated result is less settled because the final outcome depends on a stated condition, but more established than `not-established` because the condition and the action needed to satisfy it are known. That epistemic ordering places the new member between them.

One disposition is sufficient across gate mechanisms because the reader-facing result has the same character: an actionable predicate determines the outcome. Splitting configuration and install-scope diagnostics would organize by implementation source rather than by what became of the construct, contradicting the report's governing axis.

The new member also removes the provisional lie in `carried-unenforced`. Bytes reaching an output do not establish that the runtime will interpret them, while a named condition establishes more than the unknown bucket claims.

## Alternatives

- **Place `gated` before `nothing-to-carry`** — rejected: a fully established no-op is more settled than a two-valued conditional outcome.
- **Keep `carried-unenforced`** — rejected: describes enforcement of carried bytes, not an explicit condition the reader can satisfy.
- **Use `not-established`** — rejected: discards the known condition and the most actionable fact in the diagnostic.
- **Create one disposition per gate mechanism** — rejected: groups by the source of uncertainty instead of the disposition the report exists to communicate.
