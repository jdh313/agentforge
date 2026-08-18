---
id: "xrp1ev"
title: Preview plugin onboarding before source mutation
status: current
decision_date: 2026-07-20
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - process
  - write-side
binds:
  - .agents/skills/agentforge-onboard-plugin/**
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# xrp1ev — Preview plugin onboarding before source mutation

## Decision

Require plugin onboarding to produce a complete path-disposition inventory, proposed canonical definitions, and target compatibility report before modifying plugin or marketplace sources. Apply changes only after the exact preview receives approval.

## Scope

- Binds: onboarding writes to source plugins and canonical marketplace repositories.
- Does not bind: ordinary edits to plugins that are already canonically enrolled.

## Commitments

- Reconcile machine-reported file counts against disposition rows with zero duplicates and zero unclassified paths.
- Represent every target-specific or unsupported construct with an explicit declared loss rather than treating warnings as acceptance.
- Keep trial compilation outside source repositories.

## Revisit if

- A future importer demonstrates a lossless round trip and always presents a reviewable patch before persistence.

## Context

- Native manifests, supporting files, and runtime-specific behavior do not map one-to-one onto canonical definitions.
- Generated marketplace outputs are complete snapshots, so an incomplete enrollment can remove unrelated packages at cutover.
- Compiler warnings identify compatibility gaps but do not decide whether a loss is acceptable.

## Why

The dangerous failure mode is not a syntax error; it is a plausible generated definition that silently drops a file or runtime behavior. A review packet makes completeness and compatibility observable before a write can affect canonical sources or generated registries. Exact approval also separates mechanical evidence from the human decision to accept a target-specific loss.

## Alternatives

- **Write inferred definitions immediately** — rejected: review would happen after source mutation and intent errors could be mistaken for completed migration.
- **Preview definitions without a complete disposition table** — rejected: unclassified files and unsupported behavior could remain invisible.
