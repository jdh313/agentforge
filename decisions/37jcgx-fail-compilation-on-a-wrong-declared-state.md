---
id: "37jcgx"
title: Fail compilation on a wrong declared state
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - rm06pf
  - 62pj9p
---

# 37jcgx — Fail compilation on a wrong declared state

## Decision

A declared state that contradicts the observed one fails compilation, naming the construct, both states, and every occurrence site. It is not reported as a warning.

## Scope

- Binds: the severity of a declared-versus-observed state mismatch.
- Does not bind: the severity of an unclassified construct, which stays a warning.

## Commitments

- The failure names both states, so the correction is obvious without re-deriving it.
- The failure names every occurrence, so the author can check the claim rather than trust it.
- Correcting the state stays the author's edit; the compiler never rewrites the declaration.

## Revisit if

- Mismatches fire routinely on declarations that are in fact correct, indicating the observation is wrong rather than the declaration.

## Context

- The declared-loss gate already fails compilation for an undeclared construct.
- A matched declaration emits a note on every compile, carrying the declared state as fact.
- Until this check existed, that note could state something false on every run.
- There is no error severity in the diagnostic model, so failing means throwing.

## Why

A confidently wrong note is worse than no note, because a reader has no reason to doubt it. Reporting the mismatch as a warning would leave the false note firing beside the warning, which fixes nothing about the sentence a reader actually believes.

The governing gate already rejected warnings as the silence it replaces, and a stale state is the same failure wearing a declaration. Treating it more gently than a missing declaration would say that an inaccurate record is preferable to an absent one.

The friction is proportionate. A mismatch is corrected by changing one word in one file, and it can only be reached by a declaration that has stopped describing reality.

## Alternatives

- **Warn on mismatch** — rejected: non-breaking, but leaves the false note in place, which is the reported defect unfixed.
- **Correct the state automatically** — rejected: the declaration is an author's on-the-record acknowledgment, so a compiler that rewrites it destroys the thing being recorded.
