---
id: "0sqm54"
title: Keep Codex installation policy target-local
status: current
decision_date: 2026-07-18
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - git:f724d95
informed_by: []
---

# 0sqm54 — Keep Codex installation policy target-local

## Decision

Keep Codex marketplace-entry policy in the Codex adapter: emit local package sources with `AVAILABLE` installation, `ON_INSTALL` authentication, and category derived from the final merged plugin interface.

## Scope

- Binds: Codex marketplace registry entries emitted from canonical v1 definitions.
- Does not bind: package payload projection or future cross-target installation policy.

## Commitments

- Treat the final native plugin interface as the authority for Codex category.
- Do not add normalized installation or authentication fields to canonical v1 solely for Codex.

## Revisit if

- A package needs publication-specific installation or authentication policy.
- Another target needs the same policy dimensions and justifies a canonical model extension.

## Context

- The current Codex marketplace shape requires source, installation policy, authentication policy, and category fields.
- Canonical v1 has no normalized installation or authentication policy fields.
- Package-native UI metadata is already the final authority for interface category.

## Why

These values are currently Codex-specific and can be derived without widening the canonical model. Keeping them target-local preserves the v1 scope boundary and avoids promoting one target's policy vocabulary into cross-target concepts before another package or target demonstrates the need.

## Alternatives

- **Add normalized marketplace-policy fields to canonical v1** — rejected: it expands the model for one target without demonstrated cross-target semantics.
- **Omit Codex policy fields** — rejected: the emitted registry would not satisfy the current Codex marketplace shape.
