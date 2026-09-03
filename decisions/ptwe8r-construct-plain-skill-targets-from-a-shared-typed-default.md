---
id: "ptwe8r"
title: Construct plain-skill targets from a shared typed default
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/9
informed_by:
  - pgzfhy
  - wvs5an
  - 0sqm54
  - g6xvyk
---

# ptwe8r — Construct plain-skill targets from a shared typed default

## Decision

Target adapters stay ordinary typed modules, one file per target, built from a shared constructor that supplies everything spec-compliant skill targets have in common. Target-local policy remains directly imported code in that target's own file, not a named entry resolved through a registry.

## Scope

- Binds: how target adapter modules are constructed and how much each one restates.
- Does not bind: which policy is target-local, which stays a separate open question, nor the capability and key tables, which remain checked-in data.

## Commitments

- A plain-skill target is added by writing a few lines, not by copying an adapter.
- Target-local policy stays reachable by direct import, so the type checker follows it end to end.
- A target that diverges from the common shape opts out of the constructor rather than widening it.

## Revisit if

- Targets diverge enough that the shared constructor's defaults mislead more than they save.
- Adapters need to be enumerated or composed by something that cannot import them.

## Context

- `codex.ts`, `opencode.ts`, and `claude-chat.ts` are each about 22 lines differing in one string, because no shared default exists.
- Three current decisions place marketplace translation, payload routing, and Codex install policy inside each target.
- The codebase's existing declarative surfaces are typed checked-in data, not string-keyed registries.
- Three further prospective targets were identified, of which the spec-compliant skill portion is identical.

## Why

The duplication in those adapters was never evidence that they should be data. In TypeScript a declarative record already is code, so the axis that matters is whether a default exists — and a constructor removes the restated structure without moving anything.

Extraction to a registry would have introduced the one thing this codebase has avoided: policy reachable only through a name. Every other declarative surface here is typed data the compiler follows, and a string lookup between an adapter and its policy would be the first place a rename compiles and then fails at runtime.

Keeping policy physically in the target's file also keeps three current decisions as clarifications rather than supersessions, and leaves the question of which policy is target-local to be settled on its own terms rather than answered obliquely by a refactor.

## Alternatives

- **Extract adapters to a registry table with policy referenced by name** — rejected: adds a string indirection the type system cannot follow, for a saving the shared constructor already delivers.
- **Leave the adapters as they are** — rejected: it concedes the goal of adding a target cheaply, which is the whole point of the effort.
