---
id: "xbarat"
title: Fail when one construct's occurrences do not share a state
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
  - k9r6pc
---

# xbarat — Fail when one construct's occurrences do not share a state

## Decision

When the occurrences of a single construct are observed in more than one state, compilation fails and names each group. The compiler does not choose a state on the author's behalf.

## Scope

- Binds: what happens when the per-construct uniformity premise does not hold.
- Does not bind: the keying of declarations, which remains per construct.

## Commitments

- The failure lists each observed state with the occurrences that produced it.
- The failure says that a declaration covers every occurrence, so the reader sees which premise broke rather than only that something broke.

## Revisit if

- This fires on a real package, which is the evidence that per-construct keying needs revisiting.

## Context

- A declared loss is keyed by construct and covers every occurrence of it.
- That keying rests on an explicit premise: the state follows from what the target does and is therefore uniform.
- The decision that established it holds tentative conviction and names a construct needing two states as its direct falsifier.
- Verification computes a state per occurrence, so it is the first thing able to observe the premise failing.

## Why

The premise was recorded as tentative and given a named falsifier, which is only meaningful if something can report the falsifier occurring. Picking a winning state would satisfy the check while discarding the one observation that the keying decision asked to be told about.

Failing is also the honest reading of what a declaration claims. A declaration states one state for the whole construct, so if the occurrences disagree the declaration is not partly right — there is no single state for it to be right about.

The cost is bounded by rarity. This can only fire where a package genuinely contains one construct with two fates, which is the case the keying decision already agreed would change it.

## Alternatives

- **Report the majority state and compare against that** — rejected: silently discards the evidence the keying decision needs, and makes a declaration mean something no one wrote.
- **Compare each occurrence independently and fail only the disagreeing ones** — rejected: implies a declaration is per occurrence, which is the keying this deliberately does not use.
