---
id: "e4edqg"
title: Add Codex-only reasoning-summary and verbosity agent keys; rule out
  personality and service_tier
status: current
decision_date: 2026-10-07
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/frontmatter.ts
  - src/schema.ts
  - src/agent-command.ts
  - src/targets/codex.ts
  - src/codex-agent-bundle.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking task #134"
informed_by:
  - mqt5dv
  - vj6z18
  - bqyqfd
---

# e4edqg — Add Codex-only reasoning-summary and verbosity agent keys; rule out personality and service_tier

## Decision

The canonical agent schema accepts two keys no Claude loader reads: `reasoning-summary` (auto, concise, detailed, none) and `verbosity` (low, medium, high). Both are translation-only, retained by no target, and emitted only into Codex agent-role TOML as `model_reasoning_summary` and `model_verbosity`. Codex's `personality` and `service_tier` overrides get no canonical key.

## Scope

- Binds: leaf agent projection to Codex TOML, the Codex agent bundle definition schema, and the canonical agent schema.
- Does not bind: `sandbox_mode`, which Fibery #137 owns under ndr:bqyqfd, or `features`, which stays Unmapped.

## Commitments

- A canonical key may target one harness only; it is named in agentforge's kebab-case style, not the harness's field name.
- Both keys strip silently on Claude, with no `claude-only-frontmatter-stripped` or `unrecognized-frontmatter-key` warning.
- `verbosity` is emitted as written with no warning, although Codex ignores it on a model that lacks verbosity support.
- `personality` and `service_tier` are recorded as Ruled out in `docs/field-parity.md`, each with a revisit trigger.

## Revisit if

- An author needs a Codex-tuned tone, which reopens `personality`.
- Codex makes `service_tier` meaningful per role rather than per account.
- Codex changes the `ReasoningSummary` or `Verbosity` value sets, or rejects a role file carrying either field.

## Context

- codex-cli 0.154.0's `AgentRoleOverrides` has nine fields; agentforge already emitted `developer_instructions`, `model` and `model_reasoning_effort`.
- The codex-cli 0.160.0 binary carries the enums `ReasoningSummary` (auto, concise, detailed, none), `Verbosity` (low, medium, high) and `Personality` (friendly, pragmatic), and logs that `model_verbosity` is ignored on unsupported models.
- `service_tier` selects an API processing tier (fast/priority), a billing and latency choice.
- The value sets come from binary strings; no live Codex run has loaded a role carrying either new field.

## Why

The two accepted fields change how an agent's output reads, which an author reasonably sets per agent, and each has a closed value set the schema can validate. The translation-only shape from ndr:mqt5dv already lets a key reach one harness without reporting a loss elsewhere, so accepting them costs one row and one emit line each.

`personality` is a tone preset with no counterpart an author would also set for Claude, and `service_tier` is an account cost choice rather than agent behavior; adding either would grow the schema with no demonstrated author need.

## Alternatives

- **Add none and record only the convention** — rejected: leaves two closed, per-agent output controls unreachable when the cost of adding them is small.
- **Add all four** — rejected: `personality` and `service_tier` have no stated author need, and `service_tier` is not agent behavior.
- **Use Codex's field names as canonical keys** — rejected: breaks the kebab-case naming every other canonical key follows.
