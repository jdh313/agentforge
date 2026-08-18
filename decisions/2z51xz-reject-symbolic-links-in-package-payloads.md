---
id: "2z51xz"
title: Reject symbolic links in package payloads
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - architecture
binds:
  - src/package-payload-plan.ts
  - src/materializer.ts
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# 2z51xz — Reject symbolic links in package payloads

## Decision

Package payload declarations reject source files that are symbolic links or traverse symbolic-link ancestors. Materialization revalidates this boundary immediately before copying from the planned package root.

## Commitments

- Payload planning and materialization must both enforce the same link and package-boundary invariant.
- A rejected payload must fail before the staged tree replaces the current output.

## Revisit if

- Package declarations gain an explicit link mode with stable integrity checks and defined cross-platform semantics.

## Context

- Payload declarations accept package-relative exact paths, directories, and glob patterns.
- Source paths can change between definition loading and materialization.
- Following ambient filesystem links makes output depend on state outside the package declaration.

## Why

Rejecting links keeps package ownership lexical and reproducible. Revalidating at copy time closes the gap between a safe plan and a later-mutated filesystem, so atomic publication cannot accidentally ingest content reached through a retargeted link.

## Alternatives

- **Follow links contained by the package root** — rejected: a link can be retargeted after planning, and containment would depend on ambient filesystem state.
- **Validate links only while loading definitions** — rejected: it leaves a time-of-check/time-of-use gap before copying.
