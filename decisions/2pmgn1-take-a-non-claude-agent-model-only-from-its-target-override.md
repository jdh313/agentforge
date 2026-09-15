---
id: "2pmgn1"
title: Take a non-Claude agent model only from its target override
status: current
decision_date: 2026-09-15
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/frontmatter.ts
  - src/targets/codex.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking/Task #102 (AgentForge: emit native Codex TOML
    agents)"
informed_by:
  - h3aggj
  - 9n1m1a
  - 2t36rb
  - nes397
---

# 2pmgn1 — Take a non-Claude agent model only from its target override

## Decision

A canonical agent's shared top-level `model` is treated as a Claude model identifier. A non-Claude target that projects agents to a native document emits a model only from `targets.<name>.model`; a shared `model` with no such override is dropped from that target's output and reported as a stripped key.

## Scope

- Binds: agent projection to Codex agent-role TOML today, and any later native-document agent target.
- Does not bind: `effort`, whose shared vocabulary (low, medium, high, xhigh, max) both Claude and Codex accept and which still merges from the top level.
- Does not bind: Claude output, which keeps the shared `model` as before.

## Commitments

- The native-document path reads `model` from the target override layer, not from the merged frontmatter, so the generic merge does not decide model sourcing.
- Every non-Claude agent render of a source with a shared `model` emits `claude-only-frontmatter-stripped` for `model`, even when a target override supplies one.
- Authors who want a Codex model must write `targets.codex.model` explicitly.

## Revisit if

- Canonical agent frontmatter gains a vendor-neutral model vocabulary that every supported target resolves.
- Codex begins accepting Claude model aliases.

## Context

- Every existing agent source (the `agent-basic` and `agent-overrides` fixtures, Librarian's `vault-reader`) sets a shared `model` to a Claude alias such as `sonnet`.
- Codex agent-role TOML has a native `model` key that names an OpenAI model.
- The first Codex agent projection merged the shared value and emitted `model = "sonnet"`, which Codex cannot resolve.
- The 0.8 roadmap states that shared code carries AgentForge's canonical meaning and does not enumerate vendor-specific model dialects.

## Why

A model identifier only has meaning inside one vendor's catalog, so the shared value cannot be portable without a translation table. Passing it through produces a Codex agent that fails at runtime while looking correct on disk, which is worse than omitting the key and letting Codex use its configured default. Treating the shared value as Claude's matches how every current source is written, so no existing authoring breaks, and the explicit target override is already the sanctioned way to diverge per target under the field-level merge rule. `effort` is kept shared because its values are one vocabulary that both runtimes accept, so the same argument does not apply.

## Alternatives

- **Pass the shared model through** — rejected: emits Claude aliases into Codex, a silent runtime failure.
- **Cross-vendor model alias map** — rejected: puts vendor model dialects into shared code, which the roadmap rules out, and needs upkeep on every catalog change.
- **Require a target override and fail compilation without one** — deferred: too strict while model is optional and Codex has a usable default.
