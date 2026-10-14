---
id: u7mp3c
title: Preflight repository plans before sequential snapshot publication
status: current
decision_date: 2026-10-13
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/cli.ts
  - src/repository.ts
  - src/publication-paths.ts
  - CLAUDE.md
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - r8pc2n
  - jmeae1
  - 2z51xz
  - wj17a4
---

# Preflight repository plans before sequential snapshot publication

## Decision

Repository compile completes a read-only whole-repository preflight before any
write, then materializes publication plans sequentially in deterministic order
using existing recoverable complete snapshots. Stop at the first runtime
publication failure; keep earlier successes. Do not promise whole-repository
atomicity.

## Commitments

- Load all canonical packages and derive all publication plans before writes.
  Validate source/output boundaries and collisions across those plans, not merely
  within the next publication to be written.
- Reject traversal, absolute, nonnormalized and nonportable paths, symlink paths
  beneath config root, aliases, duplicate/nested output roots, and overlapping
  owned paths.
- Reject output/source directory overlap and root-registry named-file collisions
  with outputs, other registry files, or source directories, including
  file/directory conflicts. The repository configuration is a protected source
  file and cannot be replaced by a root registry.
- Preflight failure writes nothing. Publication-time recovery protects each
  snapshot; it is not rollback of earlier publications or a transaction spanning
  the repository and root-registry files.
- Output roots are complete owned snapshots, not merges with consumer data.
- Add no receipts or orphan-output deletion. Removing a publication or changing
  its output does not remove the previous root or registry; cleanup is explicit
  and outside this initial interface.

## Context

Explicit publication roots allow one command to write several independent trees
and exact root registries. Without global preflight, a later invalid plan could
be discovered only after earlier outputs changed. Global planning prevents that
avoidable partial update without claiming that fallible filesystem publication
can be made atomic across all roots.

## Alternatives

- Plan immediately before each write: rejected because predictable conflicts
  would be found after earlier publications changed.
- Whole-repository rollback: deferred because it requires a broader transaction
  and recovery protocol than independent recoverable snapshots.
- Track receipts and prune removed roots: deferred because destructive orphan
  management is not required for compile/check and needs its own ownership policy.

## Revisit if

A consumer requires cross-publication transactions or managed orphan cleanup.
Those requirements need explicit acceptance and recovery design.
