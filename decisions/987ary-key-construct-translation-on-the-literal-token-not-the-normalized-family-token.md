---
id: "987ary"
title: Key construct translation on the literal token, not the normalized family token
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
supersedes: []
superseded_by: []
derived_from:
  - JUN-357
informed_by:
  - g6xvyk
---

# 987ary — Key construct translation on the literal token, not the normalized family token

## Decision

A translation entry is keyed by the construct's literal spelling, and the
translation lookup runs before the normalized-token lookup. Support and
non-support stay keyed on the normalized family token.

## Scope

- Binds: translation resolution in the capability table.
- Does not bind: the supported and unsupported lists, which continue to be
  matched on the family token a shape normalizes to.

## Commitments

- Every translated member of a family must be listed individually; adding a
  translator for one variable does not cover its siblings.
- The two lookups are ordered, and the order is load-bearing rather than
  incidental — a refactor that reorders them silently changes which constructs
  are gated.

## Revisit if

- A target translates an entire construct family uniformly, making per-member
  entries pure repetition.
- Family normalization grows granular enough that a family token and a literal
  token stop being meaningfully different.

## Context

- Construct shapes are normalized to a family token before the table is consulted:
  every `${CLAUDE_*}` variable collapses to one token.
- That token is listed as unsupported on Codex, which is correct for most members
  of the family.
- Exactly two members are translated in hook configurations; the rest, including
  `${CLAUDE_PROJECT_DIR}`, are genuinely lost.
- A frontmatter construct such as `disable-model-invocation` has no family at all
  and is only ever itself.

## Why

Normalization exists so a table does not need a row per spelling, and it is right
for the support question — Codex's lack of body templating is a fact about the
family, not about individual variables. Translation is the opposite: it is
built one construct at a time by whoever wrote the translator, so its true grain
is the literal.

Keying translation on the normalized token would therefore have marked the whole
`${CLAUDE_*}` family translated on the strength of two members, silently
exempting every other Claude variable from the declared-loss gate. That failure
is invisible in tests that only exercise the translated members, which is what
makes the ordering worth recording rather than leaving to the next reader's
inference.

## Alternatives

- **Key translation on the normalized family token** — rejected: two translated
  members would have exempted the entire family, turning a gate into a hole.
- **Give each translated variable its own family** — rejected: families describe
  construct shapes for detection, and splitting them by translation status would
  make detection depend on a target's implementation.
