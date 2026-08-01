---
id: "b71vq2"
title: Read a declared loss's state off the emitted output
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/package-payload.ts
  - src/compatibility.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - g6xvyk
  - k9r6pc
  - rm06pf
---

# b71vq2 — Read a declared loss's state off the emitted output

## Decision

Derive a construct's observed state by inspecting what the compiler emitted for its source, never by predicting it from a table of per-construct expectations.

## Scope

- Binds: how a declared loss's state is determined at compile time.
- Does not bind: which constructs are losses, which the capability table decides.

## Commitments

- Verification runs after outputs exist, so the evidence is the output itself.
- A source that emitted nothing is `stripped`; a source copied byte-identically is `retained-unenforced`.
- Every branch that produces output attributes it to its source, so an unattributed source means nothing was emitted rather than a mapping that was missed.

## Revisit if

- A target appears whose emitted output is not readable at compile time.
- Attribution stops being possible inside the function that produces the outputs.

## Context

- A declared loss names a state, and until now nothing compared that state to what the compiler did.
- Two derivations were available: a table mapping each construct to its expected fate, or reading the emitted output directly.
- The capability table is checked in precisely because a target's support cannot be observed locally without a network fetch.
- What became of a construct in this compilation is, by contrast, sitting in memory the moment the outputs are built.

## Why

A predictive table would be one more unverified assertion about what the target does, which is the exact defect this check exists to close. Adding it would move the unverified claim from the author's YAML into the compiler's source, where it is harder to notice and drifts every time a translator changes.

The prior decision to check the capability table into the repository is not a precedent for this. That table records facts about a foreign system that compilation cannot observe, and it pays for that with a per-row citation. Here the fact is local and free, so the citation-and-drift cost buys nothing.

Observation also makes the check total rather than partial. A table would have to answer for every construct or stay silent where it could not, whereas reading the output answers uniformly for constructs that do not exist yet.

## Alternatives

- **A rule table keyed by detection domain** (frontmatter implies `stripped`, body implies `retained-unenforced`) — rejected: cheap and needs no reordering, but its rows are unverified assertions that drift silently as translators change.
- **Ask the target adapter to declare each construct's fate** — rejected: moves the same unverified claim into the adapter and multiplies it per target.
