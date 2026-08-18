---
id: "7rmqea"
title: Do not implicitly merge target-native sidecars
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/compiler.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# 7rmqea — Do not implicitly merge target-native sidecars

## Decision

Treat a supplied target-native sidecar as an opaque file. Preserve its bytes when unopposed, or replace one generated or translated file as a whole under the explicit collision override; never infer a structured merge.

## Commitments

- Keep materialization independent of YAML or other sidecar schemas.
- Require any future merge behavior to define and validate target-specific semantics explicitly.

## Revisit if

- A target publishes a stable merge contract that AgentForge can validate without inventing key or sequence precedence.

## Context

- Target-native policy files can be structured documents such as YAML.
- Different targets may assign incompatible meaning to mapping keys, sequences, and omitted values.
- A structurally valid merged document can still express unintended policy.

## Why

Opaque replacement preserves author intent and keeps the compiler's filesystem contract deterministic. Schema-free deep merging would make AgentForge responsible for semantics it cannot validate and could produce plausible output whose policy differs from both inputs.

## Alternatives

- **Deep-merge YAML mappings** — rejected: mapping precedence and sequence behavior are target-specific.
- **Merge only known sidecar names** — deferred: name recognition alone does not supply a stable schema or merge contract.
