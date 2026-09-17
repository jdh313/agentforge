---
id: "61cmc9"
title: Key a translation verdict to the surface its evidence scopes it to
status: current
decision_date: 2026-09-17
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/compatibility.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking/Task #101 — AgentForge: verify runtime expansion of
    directory tokens"
  - https://developers.openai.com/codex/plugins/build
informed_by:
  - yf5cf4
---

# 61cmc9 — Key a translation verdict to the surface its evidence scopes it to

## Decision

A construct's `translated` verdict is keyed to the `(target, surface)` whose primary source establishes the expansion. A translator that reads its translations from a row for a different surface than the one it acts on is a defect, not a shortcut.

## Scope

- Binds: the capability table's `translated` map and every consumer of `translationFor` / `translationsFor`.
- Does not bind: `CapabilityRow`'s shape. The surface axis already existed; it was mis-assigned, not missing.
- Does not bind: which constructs a target translates, which remains a question about that target's evidence.

## Commitments

- A translator names the surface it acts on when it reads the table, and that surface is the one its citation covers.
- A row's `source` citation states the surface its evidence establishes, so a reader can tell a hook-execution fact from a body-substitution fact without leaving the table.
- Extending a translator to a second surface requires evidence for that surface, not reuse of the first surface's row.

## Revisit if

- A single construct is established on two surfaces of the same target with different native forms, so one entry per (target, surface, construct) can no longer express what it becomes.

## Context

- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` sat in the `codex/skill` row's translated map.
- Two consumers read that one row: the marketplace adapter rewrote hook command strings from it, and the body scanner reported a `translated` verdict from it for the same tokens appearing in SKILL.md prose.
- Codex documents both variables only for a plugin hook command's process environment and an Agent Plugins MCP stdio `cwd` field; codex-cli 0.154.0's strings table ties them to no body-substitution path.
- The row's own citation already read "native hook variables" while the row was being applied to a skill body, so the text and the keying disagreed before anything was changed.
- `SKILL_DIR`, named alongside them in the originating task, exists in no harness and in no agentforge source.

## Why

A capability row is a claim, and the surface is half of what it claims. Sharing one row across two surfaces made a true statement and a false one indistinguishable: the hook rewrite was correct and evidence-backed, while the body verdict told an author that a token was carried into a native form when nothing carried it. Because both read the same entry, neither could be corrected without the other, and the correct behavior would have been the likelier casualty of a naive fix.

Siting the entry on the surface its evidence covers makes the table self-checking. A row carries one citation, so a translation that lands on the wrong row now puts a claim next to a source that does not support it — visible to a reader comparing the two, rather than latent until someone traces both consumers.

The narrower alternative, keeping the entry where it was and teaching the body scanner to ignore it, would have moved the fact out of the table and back into a consumer, which is the drift `yf5cf4` and `ndr:mfchxa` both exist to prevent. The false verdict was a symptom; the entry's location was the defect.

## Alternatives

- **Suppress the body verdict in `scanBody`** — rejected: re-expresses a table fact as consumer logic, the exact drift that put a second literal list beside the translator in the first place.
- **Widen `CapabilityRow` with a per-construct surface list** — rejected: the `(target, surface)` key already expresses this, and a second surface axis inside a row keyed by surface is redundant machinery.
- **Leave it and document the discrepancy** — rejected: a comment explaining that a table entry means something other than what its key says is the failure `yf5cf4` already ruled out for this table.
