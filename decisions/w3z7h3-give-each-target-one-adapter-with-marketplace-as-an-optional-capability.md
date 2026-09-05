---
id: "w3z7h3"
title: Give each target one adapter with marketplace as an optional capability
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/targets/**
  - src/cli.ts
  - src/compiler.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/20
informed_by:
  - ptwe8r
  - pgzfhy
---

# w3z7h3 — Give each target one adapter with marketplace as an optional capability

## Decision

A target has exactly one adapter. Marketplace compilation becomes an optional capability on it rather than a separate adapter family, and the target registry is the single enumeration of targets that anything consumes.

## Scope

- Binds: the adapter type, the registry, and every caller that enumerates targets.
- Does not bind: what a target's marketplace capability contains beyond being present, nor which translation each target performs, which stays target-owned.
- Does not bind: adapter construction shape, which stays a shared typed constructor with direct imports.

## Commitments

- Marketplace capability is a presence test on one object, so a target cannot be marketplace-capable in one place and not another.
- Enumerating targets means consulting the registry; no shared file hand-lists adapters.
- Adding a marketplace-capable target is a registry entry plus its own module, with no shared file gaining a case.
- Dependency injection of adapters into compilation survives for tests; only the hand-written list at the call site goes.

## Revisit if

- Render-side and marketplace-side concerns diverge enough that one object misleads about what a target supports.
- A target needs several marketplace capabilities at once, making a single optional member the wrong cardinality.

## Context

- Two disjoint adapter types exist: one holding a target's name and artifact configuration, the other holding a target's name and its publication compiler.
- Only the first is held in a registry; the marketplace adapters reach their single consumer as a hardcoded two-element array literal at `cli.ts:161`.
- Adding a marketplace-capable target therefore requires editing a shared file that no target owns.
- Three prospective targets, pi and hermes and openClaw, are each marketplace-capable, against two such targets today.
- The existing artifact configuration is already an optional map, so a capability a target may or may not have is an established shape here.
- `compileMarketplace` already accepts its adapters as a parameter rather than reaching for them.
- No import cycle stands in the way: the compiler module does not import the target registry.

## Why

The hand-written array is a live violation of the placement rule it sits beneath. The rule says no shared file gains a case when a target is added, and `cli.ts` gains one today — not as a future risk but as a present fact, and three of the next targets will each trigger it.

Two families also make one question answerable in two places that can disagree. Whether a target is marketplace-capable is a property of the target, and splitting it across two registrations means a target can be registered in one and absent from the other with nothing to catch it. A presence test on a single object makes that state unrepresentable, using the same optionality the artifact map already relies on for a different axis.

Folding the families changes no ownership. Each target keeps its own translation, and the compiler keeps accepting adapters as an argument, so the only thing that goes is the list a human maintains.

Conviction is strong because the defect is on disk rather than anticipated, and the fix removes a file rather than adding an abstraction.

## Alternatives

- **Keep two families and give the second its own registry** — rejected: it removes the hand-written list but leaves marketplace capability answerable in two places that can disagree.
- **Leave the hardcoded array** — rejected: it is the shared-file case the placement rule forbids, and three prospective targets each hit it.
