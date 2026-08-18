---
id: "jmeae1"
title: Publish marketplace builds as recoverable complete snapshots
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/materializer.ts
supersedes: []
superseded_by: []
derived_from:
  - git:15447e5
informed_by:
  - cp4rfn
---

# jmeae1 — Publish marketplace builds as recoverable complete snapshots

## Decision

Materialize each compilation plan as a complete output snapshot in a sibling staging tree, then replace the destination only after every generated and copied output succeeds. When replacing an existing build, preserve it as a recoverable sibling until the staged tree is published.

## Scope

- Binds: filesystem materialization of a completed `CompilationPlan`.
- Does not bind: pure compilation, target adapter behavior, or canonical output destinations.

## Commitments

- Re-check every resolved destination for containment inside the staging root before writing.
- Remove stale output by replacing the destination tree rather than merging into it.
- Restore the prior tree when publishing the staged replacement fails.

## Revisit if

- Supported platforms provide a stronger atomic directory-exchange primitive.
- Marketplace output must cross filesystem boundaries.
- Streaming materialization becomes a product requirement.

## Context

- A compilation plan contains deterministic generated and copied outputs but performs no filesystem I/O.
- Existing output roots may contain stale files from an earlier plan.
- Direct writes can expose a mixture of old and new files when generation or copying fails.

## Why

The output root is a generated product, so callers need either the prior complete build or the next complete build—not an intermediate merge. Staging keeps fallible generation and copy work away from the visible destination, while retaining the prior tree through publication provides a practical recovery path on filesystems without a portable directory-exchange operation.

## Alternatives

- **Merge directly into the existing output tree** — rejected: stale files survive and failures expose partially updated marketplaces.
- **Delete the destination before writing** — rejected: any later failure destroys the last known-good build.
