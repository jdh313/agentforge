---
id: "k881v5"
title: Model package payloads as ordered source/destination entries
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/definitions.ts
  - src/package-payload-plan.ts
supersedes: []
superseded_by: []
derived_from:
  - git:0695d63
informed_by:
  - wvs5an
  - cp4rfn
---

# k881v5 — Model package payloads as ordered source/destination entries

## Decision

Represent canonical package payload declarations as an ordered `payloads.include` list whose entries require `source` and may provide `destination`. Sources accept exact files, trailing-slash directories, and globs; remapped directory and glob destinations must end in `/`.

## Scope

- Binds the canonical `PACKAGE.yaml` schema and loader-side payload normalization.
- Does not bind output materialization, collision handling against generated artifacts, or target capability policy.

## Commitments

- Preserve declaration order and sort each expanded match set.
- Resolve declarations only against the loader's package-relative file inventory.
- Keep normalized source/destination intent available to target compilation without adding filesystem I/O there.

## Revisit if

- Payload precedence requires operators beyond ordered inclusion.
- A source kind cannot be represented as an exact path, directory, or glob.

## Context

- Canonical artifact patterns cannot express arbitrary package-level files or explicit destination remapping.
- Required payloads include individual files, directory trees, and pattern-selected files.
- Package compilation already receives a complete file inventory and must remain independent of ambient filesystem access.

## Why

Explicit entries keep every mapping cold-legible at the schema boundary: the loader can validate source expansion, destination safety, and ambiguity before downstream compilation sees the plan. One ordered representation also gives later materialization work a deterministic input without importing target support policy into the shared planner.

## Alternatives

- **Free-form ordered include rules** — rejected: destination semantics and validation boundaries would remain implicit.
- **Target-qualified declaration strings** — rejected: source definitions would encode routing policy owned by target adapters.
