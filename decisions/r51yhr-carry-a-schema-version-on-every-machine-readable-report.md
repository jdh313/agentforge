---
id: "r51yhr"
title: Carry a schema version on every machine-readable report
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
  - read-side
binds:
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/2026-08-09-compilation-report-companion.md decision-log row 5
informed_by: []
---

# r51yhr — Carry a schema version on every machine-readable report

## Decision

Machine-readable report output carries a `schemaVersion` field, bumped whenever
the shape changes in a way a parser would notice. Human-readable formats do not.

## Scope

- Binds: the JSON compilation report, and any later machine-targeted format.
- Does not bind: markdown output, whose consumer is a reader rather than a
  parser.

## Commitments

- A shape change that a parser would notice requires a version bump; shipping
  one without is the failure this exists to prevent.
- The field is part of the contract, so it cannot later be dropped as noise.

## Revisit if

- The format stops having programmatic consumers.

## Context

- The JSON report exists so CI can read it — fail a build on a new unsupported
  construct, or diff two compiles.
- A consumer parses whatever it is handed and cannot tell an intended shape from
  a changed one.
- The report is expected to grow: counts and timings are anticipated, and
  omission data is blocked only on L-007.

## Why

The asymmetry decides it. Adding the field costs one line now; adding it after
consumers exist cannot be done cleanly, because the first parser has no way to
know whether an unversioned document predates versioning or was produced by a
newer writer.

Growth is not hypothetical here, which raises the odds the shape changes at
least once. A consumer that can detect the change fails loudly; one that cannot
misreads the new shape as the old one and reports something false — the worse of
the two failures, and the harder to trace.

## Alternatives

- **Omit the field for minimalism** — rejected: defensible while the only
  consumer is this repo, but it makes the first shape change a silent breakage
  and cannot be retrofitted.
- **Version via a filename convention** — rejected: the path is the caller's to
  choose, so the format cannot rely on it.
