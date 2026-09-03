---
id: "4b0ed9"
title: Keep disposition as the diagnostic registry's only organising axis
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - read-side
binds:
  - src/report.ts
  - src/compiler.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/4
informed_by:
  - 728mf7
  - 71jgk2
  - g6xvyk
---

# 4b0ed9 — Keep disposition as the diagnostic registry's only organising axis

## Decision

The diagnostic registry is a flat union organised by disposition alone. Whether a
capability table said no or had no row is a naming discipline binding the subset
of codes minted from a table lookup, and never a structural partition of the
registry.

## Scope

- Binds: the structure of the diagnostic registry and the naming of diagnostic
  codes.
- Does not bind: how a construct resolves against the capability table, or which
  disposition a given code maps to.

## Commitments

- A code named with the unsupported prefix must be minted from a table verdict, so
  a code outside that subset carrying the prefix is a defect to rename.
- Any future organising axis must be answerable for every code before it can group
  anything.
- The naming discipline covers only part of the registry, so a reader cannot infer
  a code's origin from the absence of a prefix.

## Revisit if

- Every diagnostic code comes to be minted from a table lookup, making the verdict
  axis total.
- A reader needs to filter by why a diagnostic fired rather than by what became of
  the construct.

## Context

- Ten of the fifteen compiler codes are minted from a capability lookup; five are
  not.
- The five without a verdict come from an adapter's own artifact-support check, a
  hardcoded runtime cap, a structural no-op, a projection inference, and an output
  collision.
- One code carries the unsupported prefix while consulting no table at all, so the
  prefix already claims a verdict that does not exist.
- The naming distinction between a table saying no and a table having no row is an
  established commitment on the frontmatter and body diagnostics.
- Severity is a stored field that was demoted as an organising axis because it
  answers a different question than the one a report is opened to answer.
- Every code has an answer to what became of the construct, including the five with
  no table verdict.

## Why

An axis cannot organise a set it does not cover. The verdict axis answers why a
diagnostic fired and has no answer at all for a third of the registry, so
promoting it would either invent verdicts for five codes that have none or leave
them ungrouped, and both defeat the totality the closed set was built for.
Disposition is the only axis total by construction, which is why the report found
it rather than chose it.

That does not demote the verdict distinction, it locates it. The distinction is
real and load-bearing where it applies, and the right shape for something true of
a subset is a naming rule over that subset rather than a partition of the whole.
The rename that follows is not cosmetic: a prefix that is honest on nine codes and
decorative on the tenth is a prefix a reader cannot trust anywhere, which costs
more than the rename saves.

## Alternatives

- **Structure the union along the table verdict** — rejected: requires inventing a
  verdict for five codes that never consult a table.
- **Carry both a disposition and an optional verdict on every code** — rejected:
  buys a second classification obligation over a partial axis, and the partial half
  can never be enforced.
- **Leave the misnamed code alone** — rejected: one decorative use of a reserved
  prefix makes the reservation unreliable everywhere it is used correctly.
