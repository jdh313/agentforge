---
id: "3xe5wv"
title: Derive package outputs from canonical source layout
status: current
decision_date: 2026-07-18
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - repo-shape
  - write-side
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - git:f724d95
informed_by: []
---

# 3xe5wv — Derive package outputs from canonical source layout

## Decision

Derive each package document destination and marketplace registry source path from the loaded `PACKAGE.yaml` directory relative to the loaded `MARKETPLACE.yaml` directory.

## Scope

- Binds: generated package manifests and local registry source paths.
- Does not bind: future payload projection or filesystem materialization behavior.

## Commitments

- Preserve the canonical package directory relationship when proposing native outputs.
- Avoid introducing a publication-specific package root until the model explicitly represents one.

## Revisit if

- Payload projection requires a publication-specific package root independent of canonical source layout.

## Context

- Loaded package definitions already retain their source file paths.
- Test fixtures place packages below `packages/`, while the real marketplace corpus places them below `plugins/`.
- Canonical v1 has no separate field for a publication package root.

## Why

The relative relationship already present in the loaded definitions is sufficient for both layouts and does not invent an undeclared convention. It keeps proposed documents colocated with the package shape the compiler was given while leaving room for a later explicit projection model.

## Alternatives

- **Force `plugins/<package-id>`** — rejected: it would break fixture-shaped collections and add an output-layout convention absent from the canonical model.
- **Add a canonical publication root now** — deferred: JUN-301 explicitly excluded canonical v1 expansion and payload projection.
