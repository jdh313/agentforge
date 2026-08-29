---
id: "6mymkr"
title: Gate output content on the bytes check already reads
status: current
decision_date: 2026-08-29
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - read-side
binds:
  - src/check.ts
supersedes: []
superseded_by: []
derived_from:
  - https://github.com/jdh313/agentforge/pull/18
informed_by:
  - tfee0d
---

# 6mymkr — Gate output content on the bytes check already reads

## Decision

`check` inspects the content of every managed output, copied passthrough
resources included, using the bytes it already reads for the drift comparison.
Content gates run on `check` and never on `compile`.

## Scope

- Binds: content-level judgements about a compiled tree.
- Does not bind: files no publication declares. A repo-wide sweep stays the
  publishing repository's own concern.

## Commitments

- Every content gate reads from the plan's outputs, so `check` and `compile`
  cannot disagree about which files were judged.
- Binary outputs are skipped rather than decoded, so a gate never reports on a
  file with no text in it.
- `compile` stays total: no content judgement may block materialization.

## Revisit if

- Reading a copied output's bytes stops being free because the drift comparison
  moves to a digest carried on the plan.
- A content gate needs to run before anything reaches disk.

## Context

- `checkManagedOutput` already read every managed output's bytes to compare them
  against the plan, and used them for nothing else.
- Copied passthrough resources are never parsed by the compiler, so no other
  check observed their contents at all.
- A consumer repository ran its own linter and secret scanner over the compiled
  tree because the compiler offered no content-level judgement.
- Compilation had no failure mode that depended on what a file contained.

## Why

The read is already paid for, so extending it costs nothing and closes the one
blind spot that mattered: a passthrough resource could carry anything and no
check would look. Placing the gates on `check` rather than `compile` keeps the
compiler total — a tree that exists is not yet a tree that was published, and
publishability is a judgement about a finished tree. That split also keeps the
failure legible: `compile` failing means the definition was wrong, `check`
failing means the output is not fit to ship.

## Alternatives

- **Scan only generated documents** — rejected: the leak class that motivated
  this lives in files the compiler never parses.
- **Gate `compile` so nothing reaches disk** — rejected: makes compilation
  partial, and a file under `--out` has not been published.
- **Leave content checks to each consuming repository** — rejected: every
  consumer would re-derive the same checks against the same output shape.
