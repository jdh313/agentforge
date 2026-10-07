---
id: "e0w650"
title: Classify a limitation by AgentForge's handling, not by the target's absence
status: current
decision_date: 2026-10-07
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - process
  - scope
binds:
  - docs/limitations.md
supersedes: []
superseded_by: []
derived_from:
  - docs/limitations.md L-010 reclassification, 2026-10-07 session
informed_by:
  - msdg46
---

# e0w650 — Classify a limitation by AgentForge's handling, not by the target's absence

## Decision

A limitations-register entry where a target lacks a concept is `by-design` when AgentForge's handling of that absence is deliberate: a decided fallback, a shipped mitigation, or an explicit unsupported projection. `open` is reserved for gaps in AgentForge's own representation that it intends to close.

## Scope

- Binds: the **Status** field of every entry in `docs/limitations.md`.
- Does not bind: whether a gap is worth an entry at all; a `by-design` entry still belongs in the register when a tester has to know it.

## Commitments

- A `by-design` entry for an upstream absence keeps its revisit trigger, so a later upstream change is still caught.
- A status change made under this rule is edited in place with a dated **Evidence** line, per the register's own convention.
- Existing entries that say the handling is deliberate while carrying `open, upstream` get reclassified when next touched.

## Revisit if

- The register gains a status value that distinguishes "blocked upstream" from both `open` and `by-design`.
- A deliberate handling is later found to be a placeholder that AgentForge does intend to replace.

## Context

- The register's status values are `open`, `by-design`, and `fixed-in <sha>`.
- L-010 (Codex plugin packages cannot register agent roles) was `open, upstream` while its own text called the Markdown-procedure mapping the intended fallback per `ndr:msdg46`, not a placeholder.
- A compiled Codex agent bundle already installs native roles at user and project scope, outside the plugin.
- `output-style` has no non-Claude equivalent and has no open entry; L-004, an upstream-shaped Codex loss, is `by-design`.
- L-013 carries `open, upstream` while saying its mapping is withheld deliberately.

## Why

Flipping the stated reason shows it carries no weight: "the target lacks the concept" is equally true of `output-style`, L-004 and L-010, yet they held different statuses. The property that actually separates them is whether AgentForge has an outstanding action of its own. Where the handling is decided, nothing in this repo is pending; the only future change is gated on the upstream harness, and a revisit trigger already captures that.

Keeping `open` for such entries made the register overstate AgentForge's unfinished work and read as though Codex users had no working path, when a mitigation ships. Tying status to AgentForge's own handling keeps `open` a meaningful to-do signal.

## Alternatives

- **Keep `open, upstream` for any target absence** — rejected: it classifies by a property shared with entries already marked `by-design`, so the status stops predicting anything.
- **Add a third `blocked-upstream` status** — deferred: it would separate a case the revisit trigger already handles, and no reader has needed the distinction yet.
