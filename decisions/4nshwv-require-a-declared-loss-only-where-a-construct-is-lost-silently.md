---
id: "4nshwv"
title: Require a declared loss only where a construct is lost silently
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/compatibility.ts
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - git:e2442a8
informed_by:
  - 2vv99y
---

# 4nshwv — Require a declared loss only where a construct is lost silently

## Decision

Require a declared loss only for a construct whose meaning is lost with nothing reported. A construct that is translated losslessly, or that already emits a diagnostic, reports a warning instead and needs no declaration.

## Scope

- Binds: which constructs enter the declared-loss gate.
- Does not bind: what a declaration emits once made, or how a construct is translated.

## Commitments

- Gate a construct only after confirming it would otherwise disappear unreported.
- Keep translated-and-reported constructs on the warning path.
- State the narrowing wherever the gated set is documented.

## Revisit if

- A translated-but-reported construct turns out to mislead in practice.
- A construct appears that the target cannot express at all and that no diagnostic covers.

## Context

- The harm being addressed is a construct vanishing with nothing said, not divergence between targets as such.
- A hook handler's argument array folds into the target's single command string without losing behavior, and already emits its own warning.
- Requiring a declaration for every divergence would add entries that carry no information a reader does not already have.

## Why

A declaration is worth its friction only when it is the sole record that something was lost. Applying it to constructs that are already reported turns the surface into a checklist to satisfy rather than a statement to read, which is how mandatory annotations lose meaning. Narrowing the gate to genuine silence keeps every declaration load-bearing.

## Alternatives

- **Declare every Claude-only construct** — rejected: adds noise without adding information, and forces declarations onto packages whose behavior is fully preserved.
- **Declare nothing and warn everywhere** — rejected: returns to the silence the surface exists to end.
