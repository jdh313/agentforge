---
id: "vj6z18"
title: Resolve per-target frontmatter acceptance against a checked-in key table
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/schema.ts
  - src/render.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/9
informed_by:
  - g6xvyk
  - mfchxa
  - 0jd29k
---

# vj6z18 — Resolve per-target frontmatter acceptance against a checked-in key table

## Decision

Canonical frontmatter keys are written flat and unadorned, and which targets accept each key is resolved against a checked-in key table rather than declared in the authoring file. The renderer projects an accepted key into whatever shape the target requires, including emitting it under a target's metadata namespace.

## Scope

- Binds: per-target frontmatter key acceptance and the shape a key takes in leaf-rendered output.
- Does not bind: the canonical body, the `targets.<name>` override block, or the marketplace translation layer, where retained source frontmatter stays deliberately un-normalized.

## Commitments

- Canonical source carries no per-key target annotation and no per-agent namespace container.
- A key accepted by several targets is declared once, as membership, not duplicated per owner.
- Target-namespaced output shapes are produced by the renderer and never authored by hand.
- Ecosystem changes are absorbed by editing the table, not by editing skills.

## Revisit if

- An author needs per-file acceptance that contradicts the table for one skill.
- Two targets require the same key under incompatible shapes that a single table row cannot express.
- The table's maintenance cost exceeds the per-file annotation it replaced.

## Context

- Frontmatter keys are not partitioned by agent; `disable-model-invocation` is accepted by the Agent Skills spec, pi, openClaw, and Claude alike.
- `argument-hint` and `allowed-tools` are each accepted by several agents and owned by none.
- `CLAUDE_ONLY_KEYS` is a hand-maintained constant whose name asserts single ownership.
- The capability table already resolves body construct shapes per target from checked-in data.
- Hermes and openClaw require some keys under a namespaced map in their own output.

## Why

Keys form overlapping sets, and only a membership model represents overlap without arbitrary choices. A per-agent container forces a key four agents accept to be duplicated four times or assigned to one owner that has no better claim than the others, and the assignment then has to be re-decided every time an author touches the file.

Putting acceptance in checked-in data rather than in the authoring file puts the knowledge where a single edit fixes it. Ecosystem facts go stale — a target ships a release and its accepted keys change — and a fact that lives in every skill file goes stale in every skill file, while a fact in one table goes stale once.

This is the pattern the codebase already committed to for body constructs, applied to the one axis that never received it. The consistency is worth something on its own: two mechanisms answering the same question differently is the condition that made the extension axes expensive to begin with.

Separating canonical shape from emitted shape is what makes the whole thing free for authors. Namespacing is a real requirement of two targets' output, but it is a requirement of the output, and treating it as an authoring obligation would have imposed a migration across every existing skill to satisfy a constraint the renderer can satisfy instead.

## Alternatives

- **Per-agent namespace containers in canonical source** — rejected: models ownership where the real relation is membership, and breaks on every key more than one agent accepts.
- **A target-applicability flag per key in canonical source** — rejected: makes every author hand-maintain a compatibility matrix the compiler already holds, and it goes stale per file.
- **Leave per-target allowed-key lists on each adapter** — rejected: it is the status quo whose duplication and drift prompted the question.
