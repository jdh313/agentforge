---
id: "phbzd3"
title: Carry a target's tool-name vocabulary on its capability-table row
status: current
decision_date: 2026-10-06
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - jj nnsyzttq, uknnxuwy
  - docs/reports/codex-spawn-agent-hook-probe.md
informed_by:
  - g6xvyk
  - szdn5s
---

# phbzd3 — Carry a target's tool-name vocabulary on its capability-table row

## Decision

Which tool names a target's runtime exposes is recorded as an optional `tools` vocabulary (supported names, supported prefixes, unsupported names) on the existing `(target, surface)` capability row and answered by `toolSupportFor`. A name in neither list resolves `unknown`.

## Scope

- Binds: hook `matcher` checks on Codex, today only on events that filter on `tool_name` (`PreToolUse`, `PostToolUse`, `PermissionRequest`).
- Binds: only matcher alternatives that are bare names after an optional anchor; any other regex syntax is not classified.
- Does not bind: agent `tools`/`disallowedTools` projection or a Pi tool vocabulary, which may reuse the field later but have not.

## Commitments

- Every vocabulary entry carries its evidence in the row's `source`, like the token lists beside it.
- A surface without a `tools` vocabulary answers `unknown`, never `supported`.

## Revisit if

- A second consumer needs a mapping between vocabularies (name A on one target is name B on another) rather than membership.
- The vocabulary for one target grows large enough that keeping it inside the row hides the row's other claims.

## Context

- A Claude hook matcher naming a tool Codex does not expose (`Task`, `Read`, `Grep`) compiled cleanly and never fired, and nothing reported it.
- The capability table carried token lists answering "may this construct appear", with no notion of tool names.
- `docs/hook-event-parity.md` recorded the gap as a table-shape change and left it undetected.
- Hook matchers are unanchored regexes, and only three Codex events filter on a tool name; on the rest a matcher names a session source, compaction trigger, or agent type.

## Why

The question "does this runtime call a tool by this name" is scoped by the same `(target, surface)` key and the same evidence as the event list already on the row, so a second table would duplicate the key and split the citation from the claim it supports. Keeping it optional means no other row changes and a missing vocabulary degrades to `unknown`, which ndr:szdn5s already reports without gating. Classifying only bare names keeps the detector from guessing what a pattern matches; a skipped pattern is silence, not a false claim.

## Alternatives

- **Separate tool-vocabulary table** — rejected: duplicates the `(target, surface)` key and separates each verdict from the citation on its row.
- **Classify every matcher alternative, including patterns** — rejected: a regex is not a name, and evaluating it against a guessed tool list manufactures claims.
