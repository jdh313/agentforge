---
id: "1jhhm2"
title: Keep the compilation report out of the publication tree
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/report.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/2026-08-09-compilation-report-companion.md decision-log rows 2 and 7
informed_by:
  - 3qqk1d
---

# 1jhhm2 — Keep the compilation report out of the publication tree

## Decision

A compilation report is written to its own resolved path, never under `--out`.
It is not an output: it describes a compile rather than being one of the files
that compile produces.

## Scope

- Binds: every report format, and any future report-like artifact describing a
  compile.
- Does not bind: where a user chooses to put the report. Any path outside the
  publication tree is theirs to pick.

## Commitments

- Report paths are resolved independently of `--out`, so the two can never be
  accidentally nested by a caller passing a relative path.
- Anything added to a report must stay descriptive. The moment a report carries
  something a target needs at runtime, this boundary is the wrong one.

## Revisit if

- A harness starts consuming a compile report as installed plugin content.

## Context

- `plan.outputs` names the files a publication materializes, and every one of
  them is installed by a consumer of that marketplace.
- A publication tree is registered directly as a marketplace root, so anything
  inside it reaches an installed runtime.
- L-006 records installs serving stale or wrong bytes precisely because what
  landed in the tree was not what the compiler intended.
- The artifact's own name was settled on the same ground: "output report" was
  ruled out because `outputs` already means files that ship.

## Why

The publication tree has exactly one meaning — these are the files that ship —
and an artifact describing the build is not one of them. Writing a report inside
it would make every installer carry a diagnostic file about a compile it did not
run, which is at best noise and at worst something a harness tries to parse.

The naming settlement reinforces the same boundary from the other side. Having
ruled out a name on the grounds that a report about the shipped files is not one
of them, letting the file land in the tree anyway would have been incoherent —
the vocabulary and the filesystem have to agree.

## Alternatives

- **Write the report under `--out`** — rejected: it would ship to every
  installer as if it were plugin content.
- **Default the report path to a sibling of `--out`** — deferred: convenient,
  but an implicit path is harder to reason about than an explicit one, and the
  flag is already explicit.
