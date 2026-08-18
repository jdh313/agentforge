---
id: "snwjcr"
title: Guide plugin onboarding with a skill
status: current
decision_date: 2026-07-20
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - process
  - tooling
  - write-side
binds:
  - .agents/skills/agentforge-onboard-plugin/**
supersedes: []
superseded_by: []
derived_from:
  - shortcut:SC-34
informed_by: []
---

# snwjcr — Guide plugin onboarding with a skill

## Decision

Use a project-local agent skill to guide native plugin onboarding into canonical AgentForge package and marketplace definitions. Do not add a maintained importer CLI until repeated migrations establish a stable, lossless mechanical transformation.

## Scope

- Binds: migration of existing native plugins into AgentForge collection definitions.
- Does not bind: compilation, validation, or materialization after canonical definitions exist.

## Commitments

- Keep semantic choices about payload intent, target support, overrides, and unsupported behavior visible for review.
- Add deterministic helper automation only after at least two migrations repeat the same transformation under a stable contract.

## Revisit if

- Repeated plugin migrations expose a stable transformation that is costly or error-prone to perform through guided reasoning.
- AgentForge needs a supported import API for external automation rather than its own marketplace migration.

## Context

- Fourteen existing native plugins need canonical package and marketplace definitions.
- Correct payload and cross-target declarations depend on semantic intent that file discovery cannot establish.
- AgentForge already provides schema validation, compilation diagnostics, and drift checks for proposed definitions.

## Why

The migration cost is dominated by reviewing intent, not locating files. Encoding that review as a skill makes the process repeatable while keeping judgment explicit and avoids creating a permanent product surface around a one-time migration. Deferring mechanical automation also lets real onboarding sessions reveal which transformations are genuinely stable before AgentForge commits to maintaining them.

## Alternatives

- **Permanent importer CLI** — rejected: it would automate discovery while still requiring manual semantic review and would add a maintained interface before repeated use proves its shape.
- **Hand-author every definition without workflow guidance** — rejected: it would repeat inventory and compatibility checks inconsistently across the marketplace.
