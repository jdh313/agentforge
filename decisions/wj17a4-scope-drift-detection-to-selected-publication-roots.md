---
id: "wj17a4"
title: Scope drift detection to selected publication roots
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - repo-shape
  - read-side
binds:
  - src/check.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - s1g5yf
---

# wj17a4 — Scope drift detection to selected publication roots

## Decision

Marketplace checks mirror repeatable publication selection and treat each selected `<out>/<publication-id>/` directory as a complete managed snapshot. Paths outside selected publication roots are ignored.

## Scope

- **Binds:** missing, changed, and unexpected-file detection for marketplace publications.
- **Does not bind:** unselected publication directories or unrelated files elsewhere under the output base.

## Commitments

- Check every explicitly selected publication independently.
- Report unexpected paths anywhere inside each selected publication root.
- Leave neighboring and unselected publication roots outside the drift comparison.

## Revisit if

- Publications begin sharing generated artifacts outside their publication roots.
- A root-level manifest establishes ownership across the complete output base.

## Context

- One output base can contain multiple publication subtrees.
- Callers can select a stable subset of publications for compilation and checking.
- Unexpected-file detection requires a clear ownership boundary.

## Why

Publication-root ownership catches stale output completely without making a targeted check responsible for neighboring publications or unrelated files.

## Alternatives

- **Treat the entire output base as managed** — rejected: a subset check would incorrectly flag other valid publication roots as unexpected.
