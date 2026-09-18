---
id: "q3b191"
title: Give a structural no-op its own disposition rather than filing it as a loss
status: current
decision_date: 2026-09-17
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - read-side
  - architecture
binds:
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Project_Tracking/Task/120
informed_by:
  - bqh2gz
  - 71jgk2
  - hv9kbf
---

# q3b191 — Give a structural no-op its own disposition rather than filing it as a loss

## Decision

A diagnostic reporting that there was nothing to translate resolves to its own
disposition, `nothing-to-carry`, placed after the carried states and before the
unestablished one. It is never filed among the loss states, and never folded into
the unestablished bucket.

## Scope

- Binds: the disposition scale and the classification of structural-no-op
  diagnostics.
- Does not bind: which codes are no-ops, the report's organising axis, or where
  a future gated disposition sits relative to this one.

## Commitments

- The disposition scale gains a member, so every consumer that enumerates it must
  handle one more case.
- A no-op no longer sorts first, so the head of a report's scan holds only
  confirmed losses.
- Classifying a no-op as a loss becomes a statable error rather than the only
  available answer, so a future no-op code has somewhere honest to go.
- Where this member sits relative to the still-unbuilt gated disposition is left
  open, so that work places itself deliberately rather than by appending.

## Revisit if

- A second no-op code appears whose character argues for a different position on
  the scale.
- The gated disposition lands and the two members turn out to be one.

## Context

- Closing the diagnostic code union forced a disposition call on two codes that
  had gone unmapped, and a total record admits no abstention.
- One of them fires only when a hook configuration declares zero events, guarded
  on the declared-event count being zero.
- A configuration that declares events which are then all dropped takes a
  different branch and emits a per-event diagnostic that already classifies as a
  loss or as unestablished.
- The scale's first member is what a reader scans first, and the report exists to
  answer what did not survive.
- The unestablished bucket is what an unmapped code resolved to before the record
  was total, and it means nothing has been ruled on.
- The five existing members split into loss states, carried states, and the
  unestablished one, with no member for a construct that was never there.

## Why

A disposition names what the compile established, not what a construct suffered.
What the compile establishes about a zero-event configuration is complete and
precise: there was nothing to carry. Filing that as an undeclared loss asserts
that something was destroyed, which is false, and asserting it in the one bucket
a reader scans first spends the most valuable position in the report on a non-event.

The unestablished bucket is the other available lie. It says nothing has been
ruled on, when in fact the question is settled — the guard reads a count and the
count is zero. Rounding a settled fact down to an absence of knowledge is the
same false humility already refused for gated support.

Adding a member rather than reusing one is affordable precisely because the record
is now total: the type checker enumerates every consumer that must answer for the
new case, so the cost of the sixth member is paid once, at the compiler, rather
than accruing as a wrong claim in every report that mentions an empty hook file.

## Alternatives

- **File it as `lost-undeclared`** — rejected: asserts a destruction that did not
  happen, and sorts a no-op above real losses in every report.
- **File it as `not-established`** — rejected: claims nothing was ruled on about a
  fact the compile read directly off a zero count.
- **Leave the code unmapped** — rejected: no longer available once the
  code-to-disposition record is total, and it was the drift that made the call
  necessary.
