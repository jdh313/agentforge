---
id: "bqh2gz"
title: Close the compiler diagnostic code space and enforce classification at
  the type level
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/compiler.ts
  - src/types.ts
  - src/report.ts
  - src/render.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/4
informed_by:
  - 71jgk2
  - r51yhr
  - tfee0d
  - 728mf7
---

# bqh2gz — Close the compiler diagnostic code space and enforce classification at the type level

## Decision

A compiler diagnostic's code is a closed union of literals, and every member maps
to a disposition through a record the type checker requires to be total. The
renderer's warning vocabulary is a subset of that same union rather than a second
union assigned into it.

## Scope

- Binds: the compiler diagnostic vocabulary and its code-to-disposition mapping.
- Does not bind: check issue codes, which are a separate space; the report's
  organising axis, which is unchanged.

## Commitments

- Adding a code without classifying it in the same change fails the build, so the
  two edits can no longer drift apart.
- A code minted in the renderer is a compiler diagnostic code, so the renderer and
  the compiler now share one vocabulary module and cannot diverge quietly.
- The unmapped-code branch stays in source but becomes unreachable, so it can no
  longer be exercised by a test and survives only as a statement of intent.
- Every future code must be nameable in one place, which forecloses a target
  adapter minting a code privately.

## Revisit if

- A diagnostic code arrives from outside the type system, such as a parsed report
  or an out-of-tree emitter.
- The code set grows past the point where one author can keep it classified by
  hand.

## Context

- The code field was born as a bare string in the first commit that created the
  compiler module and has never been narrowed since.
- Compiler diagnostics are emitted from four independent modules; check issues
  come from a single comparison routine.
- The report module was written three weeks after the first diagnostic code
  existed, and mapped thirteen of the fifteen codes that already existed.
- Two codes have reported as not-established for four weeks, and neither is
  unclassified in nature; one is an informational override and one is a no-op
  report.
- No commit that introduced a diagnostic code has ever updated the disposition
  map, because every such commit predates the map.
- The renderer's warning kind is assigned into the code field verbatim at one call
  site, and carries a member no code path constructs.
- No commit message or comment argues the choice between a bare string and a union
  for either diagnostic family.

## Why

The failure this prevents already happened, and nothing detected it. Two codes
were misfiled for four weeks not because a contributor was careless but because a
mapping was backfilled by hand against a set nobody could enumerate. A total
record turns that from an invisible omission into a compile error at the moment
the omission is introduced, which is the only point at which it is cheap to fix.

The forcing function belongs at the type level rather than at runtime because the
failure is a contributor failure, not an input failure. Nothing malformed arrives
from outside; a person adds a code and does not classify it. A runtime throw would
catch a failure that has never occurred while contradicting the report's
deliberate refusal to assert a disposition it has not established.

Folding the renderer's warning vocabulary in is not tidiness but the condition of
closure. A union that excludes four codes reaching the code field through an
assignment is not closed; it is a union with an undeclared back door, and the back
door already admits a member nothing constructs. Two types over one runtime set is
the same duplication that made a translator restate what a table already said.

## Alternatives

- **Runtime forcing on an unmapped code** — rejected: contradicts the report's
  established refusal to assert an unestablished disposition, and guards an
  input-shaped failure that cannot occur while every code is minted in process.
- **Keep the warning vocabulary as a declared subset** — rejected: preserves a
  distinction whose only content is which module mints the code, which the
  diagnostic already records as provenance.
- **Two independent unions with an explicit mapping function** — rejected: a
  hand-maintained mapping between two vocabularies for one runtime set reproduces
  the drift being removed.
