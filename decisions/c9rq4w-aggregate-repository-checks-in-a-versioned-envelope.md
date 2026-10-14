---
id: c9rq4w
title: Aggregate repository checks in a versioned envelope
status: current
decision_date: 2026-10-13
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - read-side
binds:
  - src/cli.ts
  - README.md
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - r8pc2n
  - tfee0d
  - r51yhr
  - wj17a4
---

# Aggregate repository checks in a versioned envelope

## Decision

Repository check is read-only and aggregates planning failures and output drift
across publication entries. `agentforge check <config> --json` emits a versioned
repository envelope nesting the existing check report per successfully planned
entry, rather than changing or impersonating a legacy marketplace report.

## Commitments

- Derive expected state from the same publication plans compile uses; do not
  materialize temporary output to calculate expected bytes.
- Surface planning failures alongside checks of other entries; do not stop at
  the first bad publication. Invalid configuration or any planning/drift error
  makes the repository outcome failed and the exit code nonzero.
- Preserve nested reports' existing version, issue, diagnostic, and nonfatal
  translation behavior. Version the repository envelope independently.
- Check every current owned snapshot and exact optional root registry, not
  unrelated repository files or abandoned publication roots.
- Write JSON to stdout. No report-file option in the initial repository interface.
- Perform no writes, source evaluation, extension execution, lifecycle scripts,
  or package-manager processes. Static integrity is not runtime acceptance.

## Context

Repository orchestration contains both marketplace and standalone package plans.
One entry can fail planning while another has drift. Stopping early loses useful
findings; flattening existing reports loses their established structure and
version contract. A repository envelope can report both without changing legacy
consumers' reports.

## Alternatives

- Fail on the first planning error: rejected because independent entries still
  have useful check outcomes.
- Reuse the marketplace report as if it represented the repository: rejected
  because repository orchestration includes package entries and planning failures.
- Evaluate native code to strengthen checks: rejected because checking supplied
  source must remain non-executing; runtime acceptance is separate.

## Revisit if

A new report shape or explicitly authorized native-validation interface is
required. Preserve versioning and the default non-executing check boundary.
