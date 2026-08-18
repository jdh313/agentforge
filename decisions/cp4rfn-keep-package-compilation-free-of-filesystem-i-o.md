---
id: "cp4rfn"
title: Keep package compilation free of filesystem I/O
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
  - write-side
binds:
  - src/compiler.ts
  - src/definitions.ts
  - src/render.ts
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from:
  - git:fe35e68
  - git:5c4da89
informed_by: []
---

# cp4rfn — Keep package compilation free of filesystem I/O

## Decision

Package compilation operates only on already-loaded artifact source text and package file inventories. Filesystem access remains outside `compileMarketplace`: loaders gather inputs, `projectArtifact` performs pure target projection, and `render` remains the filesystem materialization wrapper.

## Scope

- **Binds:** the boundary between package definition loading, artifact projection, marketplace compilation, and output materialization.
- **Does not bind:** the canonical artifact schemas or target-specific output formats.

## Commitments

- Load declared artifact source text and the complete package file inventory before marketplace compilation.
- Keep `projectArtifact` deterministic and free of filesystem I/O.
- Keep `compileMarketplace` independent of source-directory access and temporary output trees.
- Perform target output writes and resource copying only in materialization layers such as `render`.

## Revisit if

- Artifact projection requires content that cannot be represented as loaded text or an explicit file inventory.
- Package size makes eager loading materially expensive and a lazy, testable input abstraction is needed.
- Streaming compilation becomes a product requirement.

## Context

- Marketplace packages can declare canonical artifacts plus companion resource files.
- Compilation must project the same canonical artifact differently for each target.
- Existing rendering behavior includes both semantic transformation and filesystem materialization.
- Tests need to exercise package compilation without constructing temporary source and output directories.

## Why

Separating loading, projection, and materialization makes compilation deterministic, easy to test, and reusable by non-filesystem callers. It also prevents target adapters from acquiring hidden access to source directories and keeps write behavior concentrated at the existing rendering boundary.

## Alternatives

- **Adapter-side filesystem reads** — rejected: couples target policy to source layout and makes compilation dependent on ambient filesystem state.
- **Temporary package materialization** — rejected: adds unnecessary I/O, cleanup, and failure modes to an otherwise pure compilation step.
