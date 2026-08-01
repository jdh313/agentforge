---
id: "k9r6pc"
title: Key disposition declarations by construct, not by occurrence
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/definitions.ts
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/model-review-2026-07-31-construct-disposition.md
informed_by:
  - rm06pf
  - 4nshwv
  - 62pj9p
---

# k9r6pc — Key disposition declarations by construct, not by occurrence

## Decision

A declared disposition is keyed by construct for a target and covers every occurrence of it in the package. Occurrence detail belongs in the compile-time report, not in the declaration.

## Scope

- Binds: the key of a construct disposition declaration.
- Does not bind: what the compiler reports once a declaration matches.

## Commitments

- Widening detection must not multiply the declarations an author writes.
- Occurrence-level specificity is delivered by reporting each matched site, so the specificity is not lost by declining the finer key.

## Revisit if

- Two occurrences of one construct in a package genuinely need different dispositions.
- A package grows large enough that a package-wide declaration stops being reviewable.

## Context

- A holistic model review recommended keying declarations by construct and site, on the reading that a gate should force review of each occurrence.
- The governing decision's stated purpose is catching construct types nobody enumerated, not itemizing occurrences.
- Its own revisit conditions name per-artifact declarations as a future trigger, not a present defect.
- A separate decision warns that requiring declarations too broadly turns the surface into a checklist to satisfy rather than a statement to read.
- In the observed corpus a disposition's value follows from what the target does, so it is uniform across occurrences of one construct.

## Why

The finer key would multiply declarations exactly as detection coverage grows, which is the condition under which mandatory annotations stop being read. A surface whose entries are skimmed is worse than a coarser surface whose entries are few and load-bearing, because the failure is silent in both cases but the coarse one at least stays legible.

The specificity the finer key promised is available more cheaply. Naming every matched occurrence in the compile report gives a reviewer the same list without adding anything for an author to maintain, and it cannot drift from reality the way a hand-written site key can.

Conviction is tentative because the corpus that supports the uniformity claim is one marketplace. A package needing two dispositions for one construct would falsify it directly.

## Alternatives

- **Key by construct and site** — rejected: multiplies declarations as coverage grows, and the specificity it buys is obtainable from reporting instead.
- **Key by content hash of the occurrence** — rejected: solves stability for a key that should not exist, and adds a maintained identifier to every declaration.
- **Key by path and occurrence index** — rejected: inserting an earlier occurrence silently rebinds every later declaration.
