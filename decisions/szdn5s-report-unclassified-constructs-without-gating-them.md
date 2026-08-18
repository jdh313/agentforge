---
id: "szdn5s"
title: Report unclassified constructs without gating them
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - 4nshwv
---

# szdn5s — Report unclassified constructs without gating them

## Decision

A construct-shaped string the capability table does not classify is reported as a warning and never blocks compilation. Only a construct confirmed to be lost may require a declared loss.

## Scope

- Binds: the handling of detected constructs with no capability-table entry.
- Does not bind: constructs the table classifies, which follow the existing gate.

## Commitments

- An unclassified report names the literal and its location, so a reader can decide whether it deserves a table row.
- Classifying a construct is how it becomes gateable; nothing is gated on suspicion alone.

## Revisit if

- Unclassified reports become numerous enough to be ignored rather than read.
- A pattern of unclassified constructs turns out to hide real losses in practice.

## Context

- Shape matching is deliberately broader than the set of constructs whose fate is known.
- A shape can match text that is not a Claude construct at all: an ordinary environment variable reads the same as a named argument.
- A required declaration is only meaningful when it records something genuinely lost.

## Why

Gating requires certainty that a declaration has something true to record. An unclassified shape carries no such certainty, so demanding a declaration for it would ask an author to assert a loss that may not exist, and would make the declaration surface a place where false statements accumulate.

Reporting rather than gating keeps the discovery loop open without paying that cost. The report is an invitation to classify, and classification is what promotes a shape into the gate. Staying silent instead would return to the failure this detection exists to remove, so silence is not the alternative to gating here.

## Alternatives

- **Gate every detected shape** — rejected: forces declarations asserting losses that may not have occurred, degrading the surface into a formality.
- **Ignore anything unclassified** — rejected: reintroduces the silence that made an enumerated blocklist unsafe.
