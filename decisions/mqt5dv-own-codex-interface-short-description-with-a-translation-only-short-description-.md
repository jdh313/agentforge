---
id: "mqt5dv"
title: Own Codex interface.short_description with a translation-only
  short-description key
status: current
decision_date: 2026-10-07
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/frontmatter.ts
  - src/capabilities.ts
  - src/render.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking task #133"
informed_by:
  - vj6z18
  - zc7b6k
---

# mqt5dv — Own Codex interface.short_description with a translation-only short-description key

## Decision

A canonical skill or command key `short-description` is the only source of Codex's `agents/openai.yaml` `interface.short_description`. It is retained in no target's frontmatter, reaches Codex only by translation, and is omitted when unset; nothing derives it from `description` or `when_to_use`.

## Scope

- Binds: Codex skill and command-derived skill sidecars, leaf and marketplace.
- Does not bind: `interface.display_name`, which stays derived from `name`, or other `interface` keys.

## Commitments

- A value outside Codex's documented 25-64 characters warns with `codex-short-description-length` and is still emitted as written.
- A key retained by no target is translation-only and is not reported as a stripped Claude-owned key on other targets.
- `when_to_use` stays Blocked on Codex against `description`, not against the sidecar.

## Revisit if

- Codex starts using `interface.short_description` for implicit skill selection.
- Codex enforces the 25-64 character range at load time.
- An author needs a display name that differs from the slug.

## Context

- codex-cli 0.160.0's embedded skill-creator docs describe `interface.short_description` as a human-facing UI blurb of 25-64 characters; the SKILL.md `description` drives implicit selection.
- Command-derived skill sidecars copied the full command `description` into the field, often past 64 characters.
- The parity table had `when_to_use` Blocked against this field on the premise that it steered when a skill surfaces.
- The sidecar also documents `display_name`, `icon_small`, `icon_large`, `brand_color`, `default_prompt` and `dependencies.tools`.

## Why

The field is display text, so the contest the ticket posed between `description` and `when_to_use` was not real: neither is display text, and copying `description` filled a short UI slot with routing prose. An explicit key gives authors the one value Codex wants there, and omitting it when unset avoids inventing text agentforge has no basis for.

Warning rather than rejecting on length follows the evidence: Codex states the range as guidance, and no load-time enforcement has been observed.

## Alternatives

- **Omit the field entirely** — rejected: leaves authors no way to set a UI blurb Codex documents.
- **Keep deriving it from `description`** — rejected: ships routing text, often over the documented length, into a display slot.
- **Map `when_to_use` to it** — rejected: rests on the false premise that the field steers selection.
