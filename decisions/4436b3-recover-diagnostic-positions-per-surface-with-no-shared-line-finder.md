---
id: "4436b3"
title: Recover diagnostic positions per surface, with no shared line-finder
status: current
decision_date: 2026-09-17
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/compatibility.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - git:5b223461
  - git:f9a2f3a4
informed_by: []
---

# Recover diagnostic positions per surface, with no shared line-finder

## Decision

Each surface that reports a `path:line` recovers the line by whatever mechanism its own input affords, and no shared "find the line of X" helper spans surfaces. Markdown bodies get exact per-occurrence positions from the construct scanner plus a frontmatter offset; a JSON hook document gets a heuristic re-scan of its raw text for the event name in key position.

## Scope

- Binds: `locations` population on renderer warnings and compiler diagnostics.
- Does not bind: what a diagnostic's message says, or which codes exist.

## Commitments

- A body construct's reported line is file-relative: the offset the frontmatter block consumed is added back, composed once in `frontmatterOffset` and called by both `bodyOf` and the leaf projection path.
- The hook event scanner stays private to `src/targets/codex-marketplace.ts`.
- The hook scan matches the **last** `"<event>":` occurrence, because `JSON.parse` keeps the last duplicate key and the location must agree with the object the parser produced.
- A surface that cannot locate something omits `locations` rather than emitting a guessed line.

## Revisit if

- A position-aware JSON parser enters the dependency set for another reason, making exact hook positions free.
- A third surface needs position recovery and its input is shaped like one of the existing two.

## Context

- Leaf body warnings previously deduped into a `Set<string>` keyed by literal, which discarded every repeat's line; the carrier alone could not fix it because the dedup was what destroyed the positions.
- `hooks.json` reaches its emission site through `JSON.parse`, which retains no offsets, so nothing exact is in hand there.
- Frontmatter constructs carry a file and no line. Nothing in this ledger records that as a decision; it is stated in a comment at `src/compatibility.ts:25-26` and restated at `src/compiler.ts:115-116`, on the grounds that a key is identified by its name and the names are already in the message.

## Why

The two surfaces share a field and a judgement, not an implementation. A shared helper would be reused on exactly the frontmatter constructs that were decided to carry no line, so extracting one would spread a mechanism into the one place already ruled out for it. Keeping recovery local also lets each surface state its own accuracy: the body path is exact and testable against a fixture line, while the hook path is openly heuristic and says so where it lives.

## Alternatives

- **Thread positions through a second, position-aware JSON parse** — rejected: exact, but adds a parser beside the existing zod one for a jump target whose message already names the real identifier.
- **Extract a general `lineOf(content, needle)` helper** — rejected: the generalization invites reuse on frontmatter keys, which is the precise drift this decision exists to prevent.
- **Leave hook diagnostics file-only** — rejected: on a `hooks.json` declaring a dozen events, a file alone makes the reader scan.
