---
id: "c5snzf"
title: Relativize report paths in the report layer, not in the diagnostic
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
binds:
  - src/report.ts
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/2026-08-09-compilation-report-companion.md decision-log row 7
informed_by: []
---

# c5snzf — Relativize report paths in the report layer, not in the diagnostic

## Decision

Paths written into a compilation report are relative to the marketplace root.
The relativization happens while rendering; diagnostics keep absolute paths in
memory.

## Scope

- Binds: paths rendered into any report format.
- Does not bind: `CompilationDiagnostic` and `CompilationProvenance`, which stay
  absolute, and the terminal stream, which prints what it is given.

## Commitments

- A path outside the marketplace root stays absolute rather than being walked
  back with `../`, so a report never implies a file lives somewhere it does not.
- Report rendering and diagnostic construction stay separable: nothing upstream
  of the renderer may assume paths were already made relative.

## Revisit if

- A consumer needs to resolve a report against a checkout other than its own.

## Context

- `provenance.marketplacePath` and `retainedSource.sourcePath` are absolute, so
  they carry the producing machine's directory layout.
- A generated report is a candidate replacement for a hand-maintained
  compatibility table, which would put it under version control.
- Diagnostics are consumed in-process by code that resolves and reads files.
- `definitions.ts` already had a helper with exactly the wanted semantics,
  including leaving out-of-root paths untouched.

## Why

The report and the diagnostic have different readers, and only one of them
benefits from an absolute path. In-process consumers open files and need a path
that resolves; a committed report is read by a person on another machine, where
`/Users/<someone>/…` is noise that also guarantees two contributors' reports
never diff cleanly.

Doing it at the boundary rather than at construction keeps that difference where
it belongs. Normalizing earlier would push a presentation concern into the
compiler and force every in-process consumer to re-resolve what it was already
handed correctly.

Leaving out-of-root paths absolute is the deliberate half of the rule: a
`../../..` chain is technically relative but tells a reader nothing, and the
existing helper already made that choice.

## Alternatives

- **Keep absolute paths in the report** — rejected: nothing to get wrong, but it
  bakes one machine's layout into every line.
- **Relative paths plus the absolute root recorded once** — rejected: fully
  reconstructable, but it pays a field for a reconstruction no consumer asked
  for.
- **Relativize when constructing the diagnostic** — rejected: makes in-process
  consumers re-resolve paths they could have used directly.
