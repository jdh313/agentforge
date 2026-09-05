---
id: "nes397"
title: Admit an adapter member only for questions about the target itself
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/20
informed_by:
  - gwxcfm
  - h64w43
---

# nes397 — Admit an adapter member only for questions about the target itself

## Decision

Per-target knowledge that answers a question about a document a target produced belongs on that output; only knowledge that answers a question about the target itself, true before any output exists, may become an adapter member. No member's type may be a union enumerating the known targets' differing answers.

## Scope

- Binds: additions to the target adapter interface.
- Does not bind: types internal to a single target's module, which may enumerate whatever that target's own format requires.
- Does not bind: agentforge's own vocabulary shared across targets, such as the set of native document roles, which is not an enumeration of vendors' alternatives.

## Commitments

- A proposed member that only ever gets asked while holding a produced document is refused and attached to that document instead.
- A member whose honest type enumerates what each known target answers is refused, and the target exposes behaviour rather than the value.
- Every admitted member is one each target can answer, with absence carrying a real meaning rather than standing for an unwritten case.

## Revisit if

- A question genuinely about the target proves unanswerable without holding one of its documents, making the first clause undecidable in practice.
- A refused union has no behavioural equivalent, so the ban blocks a member with no alternative shape.

## Context

- The interface's stated failure mode is growth of one accessor per shared caller, named as a revisit trigger by the decision this rule serves.
- The nesting key for a plugin source is needed by two separate consumers yet has a union type over exactly the two dialects that exist today.
- Version pinning across five prospective targets was already found inexpressible as a shared enumeration, one target refusing tags outright.
- The schema axis previously refused a design in which one vendor's model became the ceiling every other target sits under.
- Some per-target knowledge is constant for a target and is nonetheless only ever consulted while a specific document is in hand.

## Why

A rule earns its keep by catching a wrong answer someone would otherwise reach honestly, and the union ban does exactly that: the nesting key looks like a textbook adapter member, is wanted by two consumers, and has a tidy two-value type — and it is the wrong answer, for reasons that took a full argument to reconstruct each time. Stated as an admission test, the same conclusion falls out mechanically.

The ban is the ceiling argument reused. A union over what each target answers is a shared enumeration of policy, so every new target either fits under it or widens it, and the one that does neither breaks it. That has now been the deciding consideration on three separate axes, which is enough to promote it from an argument to a test.

The first clause is what keeps the interface small rather than merely well-typed. Most per-target knowledge turns out to be about a document, so under this rule it never reaches the adapter at all and the surface stops tracking the number of consumers.

Conviction is tentative because the first clause has an acknowledged grey zone: knowledge constant across all of a target's documents is arguably about the target, and the rule sends it to the document on the strength of when it is asked rather than what it describes. That reading is deliberate but untested against a second instance.

## Alternatives

- **Admit a member once two or more shared consumers need the same value** — rejected: it is variance as the axis, refused one decision earlier, and it promotes precisely the nesting key this rule exists to refuse.
- **State no rule and decide case by case** — rejected: the two homes chosen in this session would then differ by taste, and the next contributor has nothing to check against.
