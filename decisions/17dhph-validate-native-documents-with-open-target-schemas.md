---
id: "17dhph"
title: Validate native documents with open target schemas
status: current
decision_date: 2026-07-18
author: Jacob Hoehler
conviction: tentative
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

# 17dhph — Validate native documents with open target schemas

## Decision

Validate generated native marketplace documents with target-specific `z.looseObject` schemas: type documented fields and retain unrecognized keys before outputs enter the compilation plan.

## Scope

- Binds: native registry and plugin-manifest document boundaries.
- Does not bind: canonical package and marketplace definition schemas.

## Commitments

- Reject malformed values for known native fields before planning.
- Preserve unknown native fields through validation and serialization.

## Revisit if

- A target publishes a closed schema that rejects unknown fields.
- Forward-compatible native overlays cease to be a supported escape hatch.

## Context

- Canonical v1 permits unrestricted target-native overlays as final metadata authority.
- Native marketplace formats can add fields independently of AgentForge releases.
- Known native field mistakes must fail before a compilation plan is returned.

## Why

Open target schemas enforce the contract AgentForge understands without turning every platform addition into an AgentForge-breaking change. This preserves native overlays as a forward-compatible escape hatch while still giving callers early, contextual failures for fields with documented types.

## Alternatives

- **Strict target schemas** — rejected: harmless platform additions would fail compilation until AgentForge shipped a schema update.
- **No native document validation** — rejected: malformed known fields would escape into the plan and fail later during consumption.
