---
id: "msdg46"
title: Map Codex artifacts by invocation role
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-303
  - git:0697ff2
informed_by:
  - pgzfhy
  - wvs5an
---

# msdg46 — Map Codex artifacts by invocation role

## Decision

Map Claude artifacts into Codex package outputs according to invocation role: agents become reusable Markdown role procedures, while commands become skills that expose user-triggered workflows.

## Scope

- Binds: Codex projection of the representative agent and command corpus.
- Does not bind: future registered Codex agent formats or artifacts outside the representative corpus.

## Commitments

- Keep the mapping in the Codex target adapter rather than the shared compiler.
- Strip Claude execution frontmatter from inferred role procedures while retaining the source through diagnostic provenance.
- Emit command-derived skills through the existing deterministic output plan and collision checks.

## Revisit if

- Codex adds a registered agent artifact with stable package semantics.
- A representative command is not meaningfully invocable as a skill.

## Context

- The source corpus separates isolated worker behavior from explicitly invoked workflow behavior.
- Codex packages support registered skills and may carry reusable Markdown resources without registering them as agents.
- The shared compiler delegates native translation to target adapters.

## Why

Invocation role is the semantic distinction that survives the runtime boundary. Preserving it avoids presenting background worker procedures as user-facing capabilities, while still making those procedures available to Codex skills and orchestrators that need isolated roles.

## Alternatives

- **Translate both artifact kinds into skills** — rejected: it would make non-user-invoked worker roles appear as top-level user capabilities.
- **Retain both source kinds without inference** — rejected: Codex users would receive no usable adopter surface for covered workflows.
