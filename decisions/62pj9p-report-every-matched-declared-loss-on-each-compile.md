---
id: "62pj9p"
title: Report every matched declared loss on each compile
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - read-side
binds:
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-341
  - git:8a6b894
informed_by:
  - 2vv99y
---

# 62pj9p — Report every matched declared loss on each compile

## Decision

Emit a note-severity diagnostic for each declared loss that matches a detected construct, on every compile and check. A declaration suppresses the compilation failure but never suppresses reporting.

## Scope

- Binds: diagnostic output for packages carrying declared losses.
- Does not bind: which constructs require a declaration.

## Commitments

- Carry the author's note about what a target user does not get into the diagnostic message.
- Report on every run, not only the first time a construct is noticed.
- Report only declarations that actually matched a detected construct.

## Revisit if

- Diagnostic volume from declared losses drowns out actionable output.
- Consumers need the declaration set as structured data rather than as notes.

## Context

- The gate originally threw on an undeclared construct and emitted nothing once a declaration existed.
- The author's note, stating what a target user does not get, therefore stayed in the YAML and never reached anyone running the compiler.
- A package declares its losses once, but its output is compiled and checked continually.

## Why

Declaring a loss should not be how the loss goes quiet. Without this, the gate converts a one-time authoring error into permanent silence: the first person to hit the construct is forced to acknowledge it, and everyone after them sees clean output over the same lost behavior. Reporting on every run keeps the cost of the divergence visible to whoever is looking now, rather than only to whoever declared it.

## Alternatives

- **Stay silent once declared** — rejected: the declaration becomes a way to buy silence, which is the failure this surface exists to prevent.
- **Warn rather than note** — rejected: a declared, reviewed loss is a known state, not an anomaly needing action.
