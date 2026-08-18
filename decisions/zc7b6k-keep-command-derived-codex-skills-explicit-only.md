---
id: "zc7b6k"
title: Keep command-derived Codex skills explicit-only
status: current
decision_date: 2026-07-19
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
  - git:0697ff2
informed_by:
  - 0sqm54
  - pgzfhy
---

# zc7b6k — Keep command-derived Codex skills explicit-only

## Decision

Emit skill-local `agents/openai.yaml` for every command-derived Codex skill with `policy.allow_implicit_invocation: false`.

## Scope

- Binds: adopter policy for skills inferred from explicitly invoked Claude commands.
- Does not bind: canonical skills or future command sources carrying their own cross-target invocation policy.

## Commitments

- Keep the adopter-policy translation in the Codex target adapter.
- Emit the policy beside the inferred skill rather than widening canonical command behavior solely for Codex.

## Revisit if

- Canonical command behavior gains an explicit invocation-policy override.
- Codex changes the meaning or location of skill-local invocation policy.

## Context

- Source commands are invoked explicitly by users.
- Codex skill adoption policy can permit or prohibit implicit model invocation.
- Canonical command behavior currently has no cross-target invocation-policy field.

## Why

Disabling implicit invocation preserves the source command's user-controlled boundary. Target-local policy expresses that invariant without introducing a shared field for a dimension that only Codex currently requires.

## Alternatives

- **Accept the Codex adopter default** — rejected: a default change could silently make an explicitly invoked workflow implicitly selectable.
- **Add canonical invocation policy now** — rejected: no second target currently demonstrates the same policy dimension.
