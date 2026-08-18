---
id: "8e8bc7"
title: Reject payload collisions by default
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
  - src/package-payload-plan.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# 8e8bc7 — Reject payload collisions by default

## Decision

Reject exact destination collisions among supplied, translated, and generated package outputs. A supplied payload may opt into `collision: override` only when replacing one generated or translated output at the same path within the same package and publication.

## Commitments

- Emit producer-aware errors for rejected collisions and a note for an accepted override.
- Never let an override mask multiple producers, cross-package conflicts, supplied/supplied conflicts, or file/directory conflicts.
- Resolve collision records in a stable order independent of adapter proposal order.

## Revisit if

- Packages require a separately reviewable precedence policy broader than one payload entry.

## Context

- Package compilation can propose the same normalized destination from canonical projection, target translation, or declared payload copying.
- Existing collision diagnostics identified publication and package but could not distinguish output producers.
- Target-native files sometimes need to replace a synthesized equivalent intentionally.

## Why

Default rejection keeps accidental path matches visible instead of silently discarding generated policy. The narrow opt-in supports intentional target-native replacement while preserving provenance boundaries and ensuring one explicit entry cannot conceal another compiler defect.

## Alternatives

- **Supplied output always wins** — rejected: an accidental declaration would silently discard generated or translated behavior.
- **Generated output always wins** — rejected: existing target-native policy could not be preserved intentionally.
- **Global precedence ordering** — rejected: it hides package-local conflicts and weakens diagnostics.
