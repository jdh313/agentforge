---
id: "yxj9c6"
title: Keep compiler diagnostics and check issues as two code spaces
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/check.ts
  - src/compiler.ts
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/4
informed_by:
  - tfee0d
  - 71jgk2
---

# yxj9c6 — Keep compiler diagnostics and check issues as two code spaces

## Decision

Compiler diagnostics and check issues stay two closed code unions rather than
merging into one. Each is total in its own sense: compiler codes are total against
a disposition mapping, and check codes are total against nothing further, because
they are already named for the state they report.

## Scope

- Binds: the two diagnostic vocabularies and the reports that carry them.
- Does not bind: whether either union is closed, or how a compiler code is
  classified.

## Commitments

- A contributor must know which of the two spaces a new code belongs to, and
  nothing structural prevents adding it to the wrong one.
- The two report schema versions stay independent, so a shape change to one never
  forces a bump to the other.
- A check code is obliged to name its own state, since nothing downstream will
  classify it.

## Revisit if

- A code is genuinely needed in both spaces, so that the two vocabularies begin to
  overlap rather than stay disjoint.
- Check issues acquire a classification of their own that the compiler's
  disposition scale could serve.

## Context

- The two vocabularies share no string literal and no near-match; one set is
  loss-and-translation shaped, the other output-drift and manifest shaped.
- Check codes name the state they report directly, which is why the check path has
  no classification mapping and sorts by path and code alone.
- A check report already embeds compiler diagnostics alongside its own issues, so
  the two families appear together in one document.
- Compilation is total and never fails; check is the gate on whether a finished
  tree is publishable.
- A compiler diagnostic is a statement about a construct undergoing translation; a
  check issue is a statement about a file sitting in a finished tree.
- Check issues were a closed union from the first commit of the check module and
  have only ever gained literals.
- The check vocabulary comes from one comparison routine in one file, while the
  compiler vocabulary accretes across four adapter modules.

## Why

The two families make statements about different subjects, and a code is the name
of a statement. Nothing is gained by giving one name to two claims that can never
be confused, and something is lost: the one document where both appear would need
a discriminator to keep them apart, which is separation wearing a different hat.

The asymmetry the merge would be repairing is not a defect. Check codes need no
classification because they were named dispositionally from the start, which is
the same insight the report reached for the compiler side and expressed as a
derived mapping instead of a rename. The compiler side could not take that route
because its codes were already in use across independent modules when the insight
arrived.

The cost is real and worth naming rather than hiding: two spaces means two places
a contributor must know about. That cost is paid once per contributor, against a
merge whose benefit is a single import.

## Alternatives

- **One union with a discriminant field** — rejected: adding a discriminant to keep
  the families apart in the one document where they meet concedes that they are two
  sets.
- **One flat union** — rejected: destroys the family distinction the check report
  depends on to render compiler diagnostics without a disposition.
