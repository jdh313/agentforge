---
id: "tfee0d"
title: Derive marketplace checks from compilation plans
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - read-side
binds:
  - src/check.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - cp4rfn
---

# tfee0d — Derive marketplace checks from compilation plans

## Decision

Marketplace checks derive expected generated and copied bytes from the same pure `CompilationPlan` used by compilation, then compare that plan read-only against materialized output.

## Scope

- **Binds:** marketplace check planning and comparison in `src/check.ts` and its CLI entry point.
- **Does not bind:** output materialization or the compilation plan's existing write boundary.

## Commitments

- Do not materialize temporary output merely to calculate expected state.
- Read copied resource bytes from the plan's declared source paths.
- Treat the deterministic compilation plan as the authority for expected publication contents.

## Revisit if

- A required native validator can operate only on a staged output tree.
- Compilation plans stop representing all bytes expected in a publication.

## Context

- Marketplace compilation already produces deterministic plans containing generated content and resource-copy operations.
- A checker needs an expected state for comparison with an existing publication.
- The check command must not modify the publication being inspected.

## Why

Using one plan for compilation and checking prevents generator/checker drift while preserving the check command's read-only contract.

## Alternatives

- **Compile into a temporary directory before checking** — rejected: duplicates materialization work and introduces cleanup and filesystem failure modes.
