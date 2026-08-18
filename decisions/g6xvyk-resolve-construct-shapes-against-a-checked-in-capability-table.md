---
id: "g6xvyk"
title: Resolve construct shapes against a checked-in capability table
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
  - linear:JUN-353
informed_by:
  - rm06pf
---

# g6xvyk — Resolve construct shapes against a checked-in capability table

## Decision

Detect Claude-only constructs as general shapes, then resolve each against a capability table keyed by target and surface. The table is checked into the repository with a documentation citation per row.

## Scope

- Binds: detection of Claude-only constructs across every artifact type and target.
- Does not bind: what happens to a construct once classified, which the declared-loss surface owns.

## Commitments

- Every table row carries a source citation, so a claim about a target can be rechecked rather than trusted.
- A target that gains a second surface gets its own row rather than a widened existing one.
- Capability claims are updated by editing the repository, never by a network fetch during compilation.

## Revisit if

- A target's capabilities change often enough that a checked-in table is routinely stale.
- Shape families stop being expressible as patterns and need a real parser.

## Context

- The prior detector enumerated eight literal patterns and matched nothing else.
- An enumerated list is silent about everything it does not name, so a construct introduced after it was written passes unexamined.
- "Does this target support this construct" has no single answer per target: one target documents argument substitution on one surface and no templating on another.
- Compilation is expected to be deterministic and runnable without network access.

## Why

Inverting the polarity is the point. A blocklist fails open, so its silence is indistinguishable from safety; a shape matcher plus a lookup fails loud, because an unrecognized shape resolves to a state the caller must handle rather than to nothing at all. That converts "we did not think of this" from an invisible gap into a reported one.

Keying on target alone would encode a falsehood the first time a target exposes two surfaces with different capabilities, which is already the case. Carrying the surface makes the table state something true rather than something averaged.

Checking the table in, rather than fetching capability documentation at compile time, keeps a build reproducible and keeps a remote documentation edit from silently changing what compiles. The cost is that the table drifts from reality until someone updates it, which the per-row citation is there to make cheap.

## Alternatives

- **Extend the enumerated pattern list** — rejected: structurally silent about anything unlisted, which is the failure being removed.
- **Fetch capability documentation during compilation** — rejected: makes builds non-deterministic and network-dependent, and lets an upstream doc edit change local build outcomes.
- **Key the table on target alone** — rejected: encodes a falsehood for any target with more than one surface.
