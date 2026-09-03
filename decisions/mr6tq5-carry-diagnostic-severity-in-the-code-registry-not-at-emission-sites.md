---
id: "mr6tq5"
title: Carry diagnostic severity in the code registry, not at emission sites
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - architecture
binds:
  - src/compiler.ts
  - src/render.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/4
informed_by:
  - 71jgk2
  - mfchxa
---

# mr6tq5 — Carry diagnostic severity in the code registry, not at emission sites

## Decision

A diagnostic code's severity is declared once in the registry entry that names the
code, and an emission site supplies only the code and the message. Disposition
stays out of the registry and continues to be derived at render time.

## Scope

- Binds: where a diagnostic's severity is stated.
- Does not bind: the disposition mapping, which stays with the report, or the
  wording of any message.

## Commitments

- An emission site can no longer vary severity by context, so a case needing two
  loudnesses needs two codes.
- Adding a code means stating its severity in the same entry, making the registry
  the single answer to how loudly a code reads.
- The registry knows nothing about reports, so the mapping from code to disposition
  stays correctable without touching an emitter.

## Revisit if

- A single code genuinely needs to read at two loudnesses, and splitting it into
  two codes states something false.
- The registry begins accumulating fields that exist to serve one consumer.

## Context

- Every compiler diagnostic code resolves to exactly one severity across all its
  emission sites, with no counterexample in the current code.
- Severity is restated at each of the fifteen emission sites and varies at none.
- Disposition was deliberately kept off the diagnostic and derived at render time,
  so that the compiler stays unaware reports exist.
- A code is the name of a statement the compiler is willing to make about a
  construct's passage to a target, and the message fills in the particulars.
- A translator was previously stopped from restating what a table already said,
  because the copy a reader trusts and the copy the code uses had drifted apart.

## Why

Severity is already a function of the code, and the code is the name of a
statement. The same statement cannot matter loudly in one file and quietly in
another; if it could, the two sites were not making the same statement and deserve
different names. Restating a functionally determined value at every call site is
the condition under which it eventually gets restated wrong.

Keeping disposition out of the same entry is the part worth defending rather than
the part worth conceding. Severity is a property of what the statement means;
disposition is a property of what a report does with it. Fusing them into one entry
would buy a contributor one file instead of two, at the cost of putting a
presentation concern inside the compiler's vocabulary, which is precisely the
separation that lets the mapping be corrected without touching a single emitter.

## Alternatives

- **Leave severity at the emission sites** — rejected: keeps fifteen restatements of
  a value that varies at none of them, and leaves nothing preventing a sixteenth
  from disagreeing.
- **Carry severity and disposition together in the registry** — rejected: buys
  one-file convenience by re-fusing the vocabulary with the presentation layer that
  was deliberately separated from it.
