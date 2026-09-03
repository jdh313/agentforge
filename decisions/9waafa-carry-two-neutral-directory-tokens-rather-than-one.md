---
id: "9waafa"
title: Carry two neutral directory tokens rather than one
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/2
informed_by:
  - mfchxa
  - g6xvyk
  - 9n1m1a
---

# 9waafa — Carry two neutral directory tokens rather than one

## Decision

Canonical source addresses a plugin root and a skill directory as two separate neutral
tokens, because they are two referents rather than one referent with several spellings.
Each resolves per target through the capability table, and a target lacking the referent
resolves to unsupported rather than to the other token.

## Scope

- Binds: the neutral vocabulary for directory references in canonical bodies, and the
  capability rows that resolve it.
- Does not bind: whether any particular target expands a given emitted token, which is a
  per-target claim its own row carries.

## Commitments

- A target whose native token names one referent never has it translated from the other,
  even when composition could produce a working path.
- The skill-directory token's resolution for a plugin-scoped target is a composed rewrite,
  so the renderer must know the skill's own name at translation time.
- Every emitted token needs a row asserting the target expands it, or the translation
  produces a dead string.

## Revisit if

- A target appears whose plugin root and skill directory are the same path, making the
  distinction unobservable.
- Authors reach for a third directory referent, such as the marketplace or workspace root.

## Context

- Claude exposes the plugin root, Hermes and openClaw expose the skill directory, and pi
  exposes neither.
- A plugin holds many skills, so the plugin root is one level above and shared across the
  skill directories beneath it.
- Of nine directory-token uses in the canonical corpus, six reach a plugin-level shared
  references directory outside any skill directory, and two compose downward into a
  skill's own scripts directory.
- The capability table already translates Claude's plugin-root and plugin-data tokens to
  neutral spellings.
- Only the project-directory family is currently classified unsupported.
- Nothing has verified that any target expands the neutral plugin-root token already
  being emitted.

## Why

The four native tokens look like four spellings of one idea and are not, and collapsing
them would repeat the fusion of two distinctions that the target model was just separated
to undo. The corpus settles it empirically rather than by argument: two thirds of real
uses reach a plugin-level shared directory that no skill directory contains, and a single
skill-scoped token would make those inexpressible.

The direction of the missing translation is the part worth recording. The plugin root
already has a neutral spelling; the skill directory, which is the referent most targets
name natively and the one authors usually want, has none. Adding it makes Claude the
target requiring an outward rewrite rather than the source everything is measured from,
which is what a spec-floor model predicts and a Claude-superset model could not express.

Marked tentative because the plugin-level need rests on one plugin's shared references
directory. If that pattern turns out to be a workaround rather than a requirement, the
second token loses its justification.

## Alternatives

- **One neutral skill-directory token, composing the plugin root away** — rejected: makes
  the six plugin-level uses in the corpus inexpressible.
- **No neutral token, leaving the construct untranslatable** — rejected: the table already
  translates half of it, so the position is not available without a regression.
- **Translate the skill-directory token to a plugin-root path for targets lacking it** —
  rejected: produces a path that works while asserting a referent the target does not have,
  which fails the moment a sibling skill shares the plugin.
