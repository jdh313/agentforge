---
id: "66z1f5"
title: Declare a projected artifact's construct surface per target and artifact
status: current
decision_date: 2026-09-05
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/targets/index.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/7
informed_by:
  - g6xvyk
  - nes397
  - msdg46
  - mfchxa
---

# 66z1f5 — Declare a projected artifact's construct surface per target and artifact

## Decision

A target declares, per artifact type, which construct surface that artifact
projects onto, defaulting to the skill surface. Shared code reads that
declaration when resolving construct support instead of assuming a single
surface for everything agentforge emits.

## Scope

- Binds: how a surface is chosen when resolving a construct against the
  capability table from shared code.
- Does not bind: the capability table's contents, or a target adapter consulting
  a surface directly for its own translation work.

## Commitments

- A target that projects an artifact onto a non-default surface says so where the
  artifact is configured, and shared code never infers it from the artifact type.
- Every shared site resolving construct support reads the declaration; none
  restates the default as a literal.
- A surface named in the type keeps its capability-table row even when no
  artifact projects onto it yet.

## Revisit if

- A single artifact projects onto more than one surface on one target.
- The surface an artifact lands on stops being knowable before projection runs.

## Context

- `render.ts:67` fixes the projected surface to `skill` for every target and
  every artifact type, with a comment stating the assumption.
- Of the three shared sites that need a surface, one reads that constant and two
  spell the literal `skill` inline.
- The capability table already carries `codex/prompt` and `codex/hook` rows, each
  with a source citation.
- The `hook` surface is consulted only by the Codex adapter, which supplies the
  surface itself rather than receiving it.
- The `prompt` surface appears nowhere outside the type that declares it.
- `codex/prompt` records `$ARGUMENTS` as supported where `codex/skill` records it
  unsupported.
- A current decision maps Codex artifacts by invocation role, which is the
  mechanism by which an artifact could reach a surface other than the skill one.

## Why

The assumption is already false in one direction and expensively frozen in the
other. A surface other than the default is reached today, by the adapter that
owns the knowledge and passes it directly — so the axis works, and only the
shared path is stuck. Freezing it there means the shared path is the one place
that cannot express what the table already documents.

The concrete failure is a wrong diagnostic rather than a wrong file. The table
records `$ARGUMENTS` as supported on one Codex surface and unsupported on
another; with the surface fixed, an artifact projected onto the supporting one
would be reported as losing a construct it in fact keeps. That is worse than
silence, because a declared loss is a claim the tooling makes on its own
authority, and a false one trains a reader to discount true ones.

The per-target, per-artifact configuration is where the declaration belongs
because that is what the admission rule for adapter knowledge already requires.
Which surface a target projects an artifact onto is knowledge about that target,
true before any output exists, which is the rule's first clause. And the surface
vocabulary is agentforge's own, shared across every target rather than one
vendor's answer set placed beside another's, so a declaration typed by it does
not enumerate targets' differing answers — the rule's second clause.

Keeping the unused surface in the type is deliberate. Its emptiness records that
nothing projects there yet, which is a fact about agentforge's translators rather
than evidence the row is wrong; the row carries a citation and is the answer
ready for the first artifact that needs it.

## Alternatives

- **Keep the constant and make the two inline literals read it** — rejected: it
  makes the assumption consistent without making it correct, and the diagnostic
  it produces stays wrong for any artifact that lands elsewhere.
- **Derive the surface from the artifact type alone** — rejected: the surface an
  artifact lands on differs by target, so a per-artifact answer would have to
  enumerate the targets that disagree.
- **Let shared code ask the target for a surface at projection time** — deferred:
  it is the same knowledge one indirection later, and nothing yet needs the
  surface to depend on anything but the pair.
