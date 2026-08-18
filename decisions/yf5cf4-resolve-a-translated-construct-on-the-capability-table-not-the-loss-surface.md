---
id: "yf5cf4"
title: Resolve a translated construct on the capability table, not the loss surface
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
  - src/compatibility.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/model-review-2026-07-31-construct-disposition.md
informed_by:
  - 4nshwv
  - g6xvyk
---

# yf5cf4 — Resolve a translated construct on the capability table, not the loss surface

## Decision

A construct that a target's translator carries into a native form resolves to a
`translated` verdict on the capability table, keyed to what it becomes. The
verdict is asserted by the tool from checked-in capability knowledge, never
declared by an author.

## Scope

- Binds: the capability table's verdict axis and every consumer that asks it what
  a target does with a construct.
- Does not bind: `PACKAGE.yaml`. A translated construct adds no key and no
  `losses[].state` value.
- Does not bind: how the verdict is surfaced to a reader, which is its own
  decision.

## Commitments

- Every construct a translator handles must have a table entry naming what it
  becomes; a translator that handles a construct absent from the table is a
  defect rather than the status quo.
- `losses[].state` stays closed to the two loss values, so a future proposal to
  widen it has to answer why the thing being described is a loss at all.

## Revisit if

- A target translates a construct only conditionally, so one verdict per
  (target, surface, construct) can no longer express the answer.

## Context

- `disable-model-invocation` was carried into `agents/openai.yaml`, but the fact
  was expressed as an inline conjunct in a warning filter.
- `${CLAUDE_PLUGIN_ROOT}` in a hook configuration was rewritten to
  `${PLUGIN_ROOT}`, with the fact expressed as a comment exempting non-prose
  artifacts from scanning.
- Codex's `dependencies.tools` is an unbuilt third instance of the same shape.
- The verdict axis had three values — supported, unsupported, unknown — and none
  of them described a construct carried across intact.
- Both existing instances are facts about what a translator does, not choices an
  author made.

## Why

The enum a value is added to determines what the system then claims. `state`
lives inside a declared loss, and a declared loss is by definition an
acknowledgment that meaning did not survive; a `translated` value there would
have made the declaration surface assert something false about every faithful
translation. The 2026-07-31 model review had already rejected a `documented`
value on the same grounds, and the argument transfers unchanged.

The capability table already answers "what does this target do with this
construct" per target and surface. A construct carried into a native form is an
answer to that question, and it was the only answer the axis could not give.

Siting it there also settles the author-versus-tool question by construction
rather than by convention: the table is checked-in tool knowledge, so nothing
about it invites an author to declare anything. That is why the two are one
decision and not two — choosing the location determined the authorship.

## Alternatives

- **A third `losses[].state` value in `PACKAGE.yaml`** — rejected: a translated
  construct is not a loss, so an author would be declaring something that did not
  happen, and the authorship question would have had to be answered separately
  and by convention.
- **A structure outside the capability table** — rejected: it would split "what
  does this target do with this construct" across two places, and the table is
  where a reader already looks.
