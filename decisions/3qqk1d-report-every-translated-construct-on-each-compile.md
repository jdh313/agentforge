---
id: "3qqk1d"
title: Report every translated construct on each compile
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - read-side
binds:
  - src/targets/package-payload.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - yf5cf4
  - 62pj9p
  - 4nshwv
---

# 3qqk1d — Report every translated construct on each compile

## Decision

Every construct that resolves to a `translated` verdict emits a note-severity
`translated-construct` diagnostic naming what it becomes, on every compile and
check. Being handled buys no silence.

## Scope

- Binds: diagnostic emission for translated constructs, wherever the construct is
  found — prose bodies, artifact frontmatter, and structured artifacts that carry
  their own translator.
- Does not bind: whether a construct is translated at all, which the capability
  table decides.

## Commitments

- The note fires on every compile and check, so a package with many translated
  constructs pays report volume for the visibility.
- A translator that handles a construct without reporting it is a defect, which
  means each new translator owes a diagnostic as well as a table entry.
- The note names the native form, so it can only be written where the destination
  is known rather than guessed.

## Revisit if

- Report volume from these notes becomes the reason authors stop reading
  diagnostics at all.
- A quieter channel appears that keeps the fact discoverable on demand without
  printing it every run.
- `yf5cf4` is superseded in a way that renames or redefines the `translated`
  verdict, since this decision is written in vocabulary that atom mints.

## Context

- Two constructs were already being translated faithfully, and neither produced
  any output during compilation.
- The absence was indistinguishable from a file the detector never scanned, since
  both produce nothing.
- That indistinguishability is how the knowledge kept being rediscovered as a
  bug: widening the detector gated `hooks.json` and broke thirteen tests, because
  nothing recorded that the construct was already handled.
- A sibling principle already holds on the loss side, where a declaration
  suppresses the compilation failure but never the reporting.

## Why

Silence is the failure this exists to prevent, and it is a separate failure from
putting the verdict in the wrong place. A correct verdict nobody can observe
leaves a reader exactly where they started: unable to tell a construct the tool
handles from one nothing ever looked at.

Note severity rather than warning is the honest level. Nothing was lost, so there
is no action for the author to take and a warning would be crying wolf; but the
fact is load-bearing enough that it belongs in the report rather than in a
comment someone has to go find.

Reporting on every run, rather than once at the moment a translator is added,
follows the same reasoning that already governs declared losses: a fact that
prints only once is a fact that will be wrong later and unnoticed.

## Alternatives

- **Leave translated constructs unreported, as before** — rejected: it is the
  status quo whose indistinguishability caused the bug, and it makes the verdict
  unobservable.
- **Warning severity** — rejected: there is no action for an author to take, and
  a warning that never needs acting on trains readers to skip warnings.
- **A separate reporting channel outside the diagnostics stream** — deferred: it
  would answer the report-volume risk, but nothing yet shows that volume is a
  real problem rather than an anticipated one.
