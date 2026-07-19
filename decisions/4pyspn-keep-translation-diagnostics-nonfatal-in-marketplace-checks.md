---
id: "4pyspn"
title: Keep translation diagnostics nonfatal in marketplace checks
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - process
  - read-side
binds:
  - src/check.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-306
informed_by:
  - 2vv99y
---

# 4pyspn — Keep translation diagnostics nonfatal in marketplace checks

## Decision

Schema, semantic, filesystem, and drift issues fail marketplace checks. Existing compilation notes and warnings remain visible but do not make an otherwise clean check fail.

## Scope

- **Binds:** check result severity and CLI exit behavior.
- **Does not bind:** the meaning or production of compilation diagnostics.

## Commitments

- Preserve compilation notes and warnings in check output.
- Exit successfully when notes or warnings are the only diagnostics.
- Fail for validation, containment, reference, or drift errors.

## Revisit if

- Consumers require a separate strict-warning mode.
- Compilation adopts a richer severity model with explicitly fatal diagnostics.

## Context

- Compilation plans carry notes and warnings for inferred or unsupported target projections.
- A usable publication can legitimately retain those diagnostics.
- The check command is intended to serve as an automation gate.

## Why

Preserving the established semantic distinction avoids rejecting usable output while still making translation limitations visible to people and automation logs.

## Alternatives

- **Fail on every diagnostic** — rejected: conflates expected translation caveats with invalid or stale output.
