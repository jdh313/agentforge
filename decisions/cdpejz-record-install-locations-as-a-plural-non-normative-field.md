---
id: "cdpejz"
title: Record install locations as a plural non-normative field
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/**
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/9
informed_by: []
---

# cdpejz — Record install locations as a plural non-normative field

## Decision

A target records where a human copies its rendered output as a plural `installPaths`, documented as non-normative: agentforge never writes there, and the render path never consults it. It replaces the singular `outputBaseDir`.

## Scope

- Binds: the adapter field describing a target's on-machine install location and its presentation in `list-targets`.
- Does not bind: the output directory the render path writes to, which stays caller-supplied.

## Commitments

- The field is documentation; a reader must be able to tell that from its name and its doc comment.
- Overlapping install paths between targets are shown as they are, not deduplicated or hidden.
- A target records every location its consumer reads from, not one representative location.

## Revisit if

- agentforge grows an install command that writes to these paths, making them normative and changing what a wrong value costs.

## Context

- The field is read only by the `list-targets` display; writes go to a caller-supplied output directory and never consult it.
- Its former name asserted that outputs are written beneath it, which is false.
- That name was misread as a write destination during this effort and produced a false claim about output collisions.
- Codex's recorded value named the Agent Skills spec's shared directory as though Codex owned it.
- Four of five prospective targets read skills from two locations each, one personal and one project-scoped.

## Why

A field that misleads a careful reader into a wrong conclusion is worth correcting even when no code reads it, and this one demonstrably did: the false collision claim it produced was written into a ticket and had to be retracted. Documentation that is wrong is worse than absent, because absence prompts a check and a confident wrong name does not.

Keeping the field rather than deleting it follows from it being the only place a user learns where rendered output belongs. That is a real service, and `list-targets` is where someone goes looking for it.

Plural is simply what the ecosystem turned out to require, and singular would have forced each target to pick one of two real locations arbitrarily. Showing overlaps rather than resolving them is the honest presentation: several agents genuinely do read one shared directory, and a field that hid that would be repeating the original error in a new form.

## Alternatives

- **Delete the field** — rejected: it is the only place a user learns where rendered output belongs.
- **Keep the singular field and correct only the wrong value** — rejected: preserves a name that already misled once, and singular is factually wrong for most prospective targets.
