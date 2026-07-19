---
id: "0jd29k"
title: Represent agent and command behavior without normalizing target metadata
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/agent-command.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-303
  - git:a9d17ac
informed_by:
  - wvs5an
---

# 0jd29k — Represent agent and command behavior without normalizing target metadata

## Decision

Represent package-level agent and command sources as canonical behaviors containing shared identity, description, instructions, kind-specific execution or invocation semantics, the raw source, and loose source frontmatter. Do not normalize target-only metadata into shared policy.

## Scope

- Binds: parsing package-level agent and command sources for marketplace translation.
- Does not bind: the leaf-renderer `ArtifactType` vocabulary or target output formats.

## Commitments

- Validate the common fields that translators depend on before compilation planning.
- Preserve raw source and unknown frontmatter so target translators and diagnostics can recover source-specific behavior.
- Add shared semantic fields only when more than one target needs them.

## Revisit if

- Another source runtime needs a shared semantic field that retained metadata cannot safely express.
- Agent or command inputs gain a stable standalone leaf-rendering contract.

## Context

- Package definitions collect open-ended artifact types as loaded source text.
- The representative marketplace corpus uses different frontmatter for worker roles and user-triggered workflows.
- Direct and inferred projections need common behavior without erasing source-specific fields.

## Why

The smallest shared model gives translators a stable semantic input while keeping source-runtime policy out of the canonical layer. Retaining both the original document and loose frontmatter preserves forward compatibility and makes incomplete translations diagnosable without forcing every source field into AgentForge's public vocabulary.

## Alternatives

- **Normalize every Claude field** — rejected: it would promote one source runtime's metadata vocabulary into cross-target policy before another runtime demonstrates the same semantics.
