---
id: "wvs5an"
title: Keep native package payload routing target-local
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
  - write-side
binds:
  - src/definitions.ts
  - src/targets/package-payload.ts
  - src/targets/claude-marketplace.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-302
  - git:5c4da89
informed_by:
  - 0sqm54
---

# wvs5an — Keep native package payload routing target-local

## Decision

Package artifact declarations remain open-ended at collection time, while each target adapter classifies which native payload types it supports. Initially, Claude passes through declared `hook` payloads; targets without support retain the source and emit structured unsupported-artifact diagnostics.

## Scope

- **Binds:** routing of package-native payload types that are not canonical cross-target artifacts, including hooks and future target-specific additions.
- **Does not bind:** canonical artifact schemas or the installation policy within each target adapter.

## Commitments

- Preserve declared package artifact type strings without forcing them into the canonical `ArtifactType` union.
- Let target adapters decide whether a native payload type is generated, passed through, or unsupported.
- Preserve unsupported source declarations and emit deterministic, structured diagnostics instead of silently dropping them.
- Keep shared payload planning limited to mechanics that do not encode target support policy.

## Revisit if

- A native payload type gains a stable, cross-target canonical representation.
- Multiple adapters duplicate substantial routing policy that can be expressed without erasing target ownership.
- Marketplace schemas require target-qualified declarations at the source boundary.

## Context

- Marketplace packages can contain canonical artifacts and native payloads with different support across targets.
- Hook formats and installation semantics are currently target-specific.
- New native payload categories are expected as marketplace support expands.
- Unsupported declarations must remain diagnosable and recoverable.

## Why

Target-local classification keeps native policy beside the adapter that owns its output contract and installation semantics. Open collection avoids turning every target-specific payload into a false cross-target abstraction, while retained diagnostics make unsupported cases explicit and safe.

## Alternatives

- **Canonical `hook` artifact type** — rejected: current hook behavior has no shared cross-target schema or projection contract.
- **Central native routing** — rejected: centralizes policy that varies by target and weakens adapter ownership.
- **Target-qualified declaration strings** — rejected: leaks target routing into source definitions and complicates future support by additional adapters.
