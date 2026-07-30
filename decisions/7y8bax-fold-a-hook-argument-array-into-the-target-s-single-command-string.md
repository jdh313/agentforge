---
id: "7y8bax"
title: Fold a hook argument array into the target's single command string
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-341
  - git:5192aad
informed_by:
  - 2vv99y
---

# 7y8bax — Fold a hook argument array into the target's single command string

## Decision

When a target's hook handler accepts only a single command string, fold Claude's separate argument array into it and report the fold, rather than dropping the handler. Quote any argument outside a conservative shell-safe set, leaving deliberate plugin-root references expandable.

## Scope

- Binds: hook handler translation where source and target argument shapes differ.
- Does not bind: handler fields the target expresses natively.

## Commitments

- Preserve every argument, including an empty one, through the fold.
- Neutralize shell metacharacters, command substitution, and globs in folded arguments.
- Keep the target's own environment references expandable across quoting.
- Report the fold rather than performing it silently.

## Revisit if

- The target adds a structured argument field, making the fold unnecessary.
- A source appears whose arguments cannot survive any quoting scheme.

## Context

- Claude passes hook arguments as an argv array that no shell interprets.
- The target receives one string that a shell splits, so the two shapes are not interchangeable.
- Dropping handlers that declare arguments would silently discard entire hooks.

## Why

Folding is the only mapping that keeps behavior, but a naive join changes semantics: an argument containing a separator becomes a second command, an unbalanced quote becomes a syntax error, a glob expands against the working directory, and an empty argument disappears and shifts the positionals after it. Quoting by default and exempting only a conservative safe set makes the fold faithful to the argv the author wrote, while the reported diagnostic keeps the shape change visible.

## Alternatives

- **Drop handlers that declare arguments** — rejected: silently discards a working hook rather than translating it.
- **Join arguments unquoted** — rejected: turns hook arguments into shell syntax and changes what runs.
