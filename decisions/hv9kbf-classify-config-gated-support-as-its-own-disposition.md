---
id: "hv9kbf"
title: Classify config-gated support as its own disposition
status: superseded
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - read-side
  - architecture
binds:
  - src/report.ts
  - src/capabilities.ts
supersedes: []
superseded_by:
  - 7r7n44
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/4
informed_by:
  - 5ymhmg
  - 71jgk2
  - szdn5s
---

# hv9kbf — Classify config-gated support as its own disposition

## Decision

A diagnostic about a construct whose support is gated on consumer configuration
resolves to its own disposition, placed between the carried states and the
unestablished one. It is never folded into the unestablished bucket, and it never
sits outside the classification.

## Scope

- Binds: the disposition scale and the classification of gated-support
  diagnostics.
- Does not bind: which constructs a capability row marks as gated, or what a gated
  diagnostic carries beyond its code.

## Commitments

- The disposition scale gains a member, so every consumer that enumerates it must
  handle one more case.
- A gated diagnostic's placement in the scale is an ordering claim that must be
  defended when a second gated construct appears with a different character.
- Classification stays total, so a gated code cannot be added without deciding
  where on the scale it falls.

## Revisit if

- Gated constructs become common enough that readers stop distinguishing the
  conditional bucket from the carried ones.
- A construct is gated on something the compiler can actually read, making its
  outcome knowable at compile time.

## Context

- A capability row can now record that a target supports a construct only when the
  consumer has enabled a named configuration option.
- The one real instance is a target that accepts inline shell in skill bodies only
  when an option that defaults to off is enabled.
- The unestablished disposition means nothing has been ruled on, and it is the
  bucket an unmapped code falls into.
- The disposition scale runs from confirmed loss to unknown, and its ordering is
  the scale rather than a convenience.
- A gated construct's outcome is a fact about the reader's installation, which is
  not available at compile time.
- The existing carried-without-enforcement state means the construct went through
  and nothing guarantees it holds.

## Why

Totality is a property of the mapping from code to disposition, not a property of
the outcome. A disposition does not name a construct's final fate; it names what
the compile established about it. What a compile establishes about a gated
construct is precise and complete: this depends on your configuration, and here is
the option. That is an answer, and reading it as a gap is what would break the
set.

Folding it into the unestablished bucket would be the same false humility already
refused when a gated construct was denied entry to the declared-loss gate. The
unestablished bucket says we have ruled on nothing; here the option is named, the
citation is on the row, and the condition is stated exactly. Rounding a precise
conditional down to an absence of knowledge discards the most actionable thing the
compile produced.

Placing it between the carried states and the unestablished one follows from what
the ordering measures. A gated construct is strictly more established than an
unclassified one, because the condition is known; it is strictly less settled than
a carried one, because the outcome is genuinely two-valued. Marked tentative
because the scale's ordering has been tested against exactly one gated construct.

## Alternatives

- **Map it to the unestablished disposition** — rejected: asserts that nothing has
  been ruled on about a construct whose enabling option is named and cited.
- **Define the classification over unconditional diagnostics only** — rejected:
  breaks totality to avoid naming one case, reintroducing the unclassified gap the
  closed set exists to remove.
- **Reuse carried-without-enforcement** — rejected: conflates a projection nothing
  enforces with a condition the reader can actually satisfy, and only the second is
  actionable.
