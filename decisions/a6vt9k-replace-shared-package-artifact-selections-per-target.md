---
id: a6vt9k
title: Replace shared package artifact selections per target
status: current
decision_date: 2026-10-13
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/definitions.ts
  - src/compiler.ts
  - README.md
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - nt12pb
  - gf2904
---

# Replace shared package artifact selections per target

## Decision

Allow `targets.<target>.artifacts` to replace a canonical package's top-level
artifact list for that target. An omitted list inherits the shared declarations;
an explicit empty list selects no artifacts. This is replacement, not union or
implicit filtering.

## Commitments

- Preserve existing artifact pattern matching, projection, compatibility/loss,
  payload routing, provenance, and collision rules for the selected list.
- Empty selection does not waive producing-payload or target-native loadable
  resource requirements. Metadata-only packages do not become valid.
- Keep target support explicit. Artifact selection does not add capabilities,
  translate unsupported artifacts, or infer support from an adjacent filename.
- Do not merge adjacent package definitions or remove their standalone support.
  Marketplace and repository universes remain canonical-only.

## Context

A shared canonical package can contain Claude/Codex hooks and canonical skills
while publishing Pi-native extension code. Pi cannot translate those hook
artifacts. Explicit target replacement lets the package author select skills
and native payloads without duplicating source files or requiring a forked
canonical definition. The prior adjacent-definition decision remains valid:
its explicit standalone loader and filename boundary are unchanged.

## Alternatives

- Add target lists to the shared list: rejected because unsupported shared
  artifacts cannot be excluded that way.
- Automatically filter artifacts the target cannot project: rejected because
  silent omission hides author intent and compatibility failures.
- Remove adjacent standalone definitions: rejected as unnecessary and breaking.

## Revisit if

Artifact selection needs independently justified richer operations than explicit
replacement. Do not add merge or automatic filtering semantics incidentally.
