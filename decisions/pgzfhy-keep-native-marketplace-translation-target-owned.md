---
id: "pgzfhy"
title: Keep native marketplace translation target-owned
status: current
decision_date: 2026-07-18
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-301
  - git:f724d95
informed_by: []
---

# pgzfhy — Keep native marketplace translation target-owned

## Decision

Each target compiler adapter owns both its marketplace-registry translation and its per-package plugin-manifest translation, deriving both document types from one resolved publication input.

## Scope

- Binds: native marketplace document construction behind `TargetCompilerAdapter.compilePublication`.
- Does not bind: generic plan ordering, destination safety, collision detection, or filesystem materialization.

## Commitments

- Keep each target's native schemas, builders, and serialization policy together.
- Keep the shared compiler unaware of target-native document fields.

## Revisit if

- A target requires publication outputs that cannot be derived from one compilation input.

## Context

- JUN-300 established `compilePublication` as the boundary for producing target-native documents.
- Registry entries and package manifests for one target must observe the same resolved metadata and precedence.
- Claude and Codex require materially different native document shapes.

## Why

One target-owned adapter provides a single authority for native translation and validation while preserving the compiler's target-agnostic role. Keeping both document types behind that authority prevents independent processors from drifting on how they resolve metadata, validate fields, or serialize output.

## Alternatives

- **Independent registry and manifest post-processors** — rejected: separate processors could diverge on precedence and validation.
- **Native translation in the shared compiler** — rejected: target policy would leak into the deterministic planning seam.
