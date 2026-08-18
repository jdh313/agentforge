---
id: "s1g5yf"
title: Isolate materialized publications under publication IDs
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - repo-shape
  - write-side
binds:
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - git:f2f8c7a
informed_by:
  - 3xe5wv
---

# s1g5yf — Isolate materialized publications under publication IDs

## Decision

Materialize every selected marketplace publication under `<output-root>/<publication-id>/`, preserving the compiler-proposed destination paths beneath that publication root. Apply the same layout whether one publication or many are selected.

## Scope

- Binds: CLI orchestration of one or more publication plans into a shared requested output root.
- Does not bind: canonical marketplace schema, target adapter destinations, or package-relative source paths inside a publication.

## Commitments

- Keep publication output locations stable when the selection set changes.
- Compile publications independently so the compiler's collision checks remain strict within each publication.
- Preserve canonical package-relative destinations below each publication subtree.

## Revisit if

- The canonical schema gains explicit noncolliding publication output roots.
- A target-independent shared-artifact layer is introduced.

## Context

- Multiple target publications can project the same canonical package paths to different content.
- The pure compiler correctly rejects colliding destinations in a single plan.
- One CLI invocation must be able to build every marketplace publication into one requested output root.

## Why

Publication identity is the stable boundary already present in the canonical model. Using it as the materialized subtree separates incompatible target projections without weakening collision validation or inventing target-specific paths, and it keeps a selected publication in the same location it occupies during a full build.

## Alternatives

- **Flatten every publication into one output tree** — rejected: target projections collide at valid canonical package paths and ownership becomes ambiguous.
- **Write a lone selected publication directly at the output root** — rejected: output locations would change according to the selection set.
