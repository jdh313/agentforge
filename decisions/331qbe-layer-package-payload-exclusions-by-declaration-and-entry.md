---
id: "331qbe"
title: Layer package payload exclusions by declaration and entry
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - write-side
binds:
  - src/definitions.ts
  - src/package-payload-plan.ts
supersedes: []
superseded_by: []
derived_from:
  - git:0695d63
informed_by:
  - k881v5
---

# 331qbe — Layer package payload exclusions by declaration and entry

## Decision

Support declaration-wide exclusions in `payloads.exclude` and entry-local exclusions in `payloads.include[].exclude`. Normalize an entry by composing both matcher sets before expanding its source.

## Scope

- Binds exclusion semantics for shared and target-specific package payload declarations.
- Does not bind future negation, re-inclusion, or materializer-side safety checks.

## Commitments

- Apply declaration-wide exclusions to every include in that declaration.
- Apply entry-local exclusions only to their owning include.
- Reject an include when exclusions leave it with no matched files.

## Revisit if

- Packages require negated exclusions or ordered re-inclusion.
- Shared declaration exclusions need to govern target-specific declarations.

## Context

- Packages need broad hygiene filters for generated, private, or test-only files.
- Individual directory and glob mappings also need narrower exceptions.
- A normalized payload plan must remain deterministic before materialization.

## Why

Layering the two scopes avoids repeating broad exclusions on every entry while preserving local precision. Composing matchers into the same normalization pass keeps the resulting plan simple: downstream compilation receives only included source/destination pairs and does not need a second exclusion model.

## Alternatives

- **Declaration-wide exclusions only** — rejected: local exceptions force unrelated includes to share patterns or split declarations artificially.
- **Entry-local exclusions only** — rejected: common hygiene patterns are duplicated across every include.
