---
id: "3772zz"
title: Classify authoring declarations by effect and authority
status: current
decision_date: 2026-09-06
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/definitions.ts
  - src/compiler.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/5
informed_by:
  - 8b6rtp
  - pjs94p
  - 331qbe
---

# 3772zz — Classify authoring declarations by effect and authority

## Decision

An authoring declaration is placed on two axes before it is wired: whether it
suppresses something or produces output, and whether a package author or a
marketplace publisher holds the authority to declare it. Wiring follows the
effect axis. No registry threads every declaration through one mechanism.

## Scope

- Binds: how a new authoring declaration is parsed, carried, and consumed.
- Does not bind: the vocabulary of any individual declaration, or its schema.

## Commitments

- A suppressing declaration consumes its declared literals in exactly one
  enforcement function, however many anchors invoke that function.
- A producing declaration may carry plan-shaped data and reach several
  consumers; that cost is accepted as inherent, not scheduled for refactoring.
- A new declaration is placed on both axes before any code is written for it,
  and the placement is stated where it is declared.

## Revisit if

- A declaration appears that both suppresses and produces.
- A suppressing declaration needs a second enforcement function that is
  behaviorally distinct rather than a second anchor on the same one.
- The effect and authority axes stop correlating, and a package author needs to
  declare something that produces output at the marketplace root.

## Context

- Five authoring declarations exist across `PACKAGE.yaml` and `MARKETPLACE.yaml`:
  `documents`, `authoring-keys`, `redactions`, `payloads`, `root-manifest`.
- Each is wired differently: a flat path set on `LoadedPackage`, a key set on
  `CompilationPackage`, a string list on `CompilationPlan`, a 396-line
  normalization module, and a boolean that touches five files.
- Adding a declaration meant guessing which of the existing shapes it resembled,
  then hand-threading it through the compilation types.
- `documents`, `authoring-keys`, and `redactions` each act by withholding a file,
  a key, or a string from a later pass; `payloads` and `root-manifest` each add
  files to the output set.
- The phase each declaration acts at — load, render, check — is fixed by what it
  withholds: a class must be known before a scan, a key stripped before
  frontmatter is inspected, a literal matched against bytes that exist only
  after compile.
- `documents` and `redactions` are each invoked from two anchors, publication
  outputs and root-manifest outputs, running the same enforcement code.
- `documents` and `redactions` are declared by no package or publication in the
  `jdh-agents` corpus, so their shape is inferred from code nothing exercises.
- `documents`'s `class` field is validated at load and never read afterward; only
  `pattern` reaches runtime.

## Why

The variety tracks a real difference in what a declaration does, so flattening it
would cost more than it saves. Withholding something needs a set of literals and
one place that honors them; adding files to the output needs a plan, a collision
policy, and every consumer that writes or reports. A single registry would have
to model the second case, and every suppressing declaration would then pay for
machinery it never uses.

Phase is the axis that most invites a registry and the one that least deserves
it. Three declarations acting at three different times looks like a dimension to
abstract over, but each phase is the mechanical minimum for what that
declaration withholds — not a choice anyone made, and not a choice a sixth
declaration will get to make either.

Authority is a second axis rather than a restatement of the first. It happens to
align today, package authors declaring the suppressions and publishers declaring
`root-manifest`, but nothing forces that: a publisher-scoped suppression is
coherent, and the alignment is a fact about the current five rather than a rule.
Naming both axes lets a sixth declaration land in an off-diagonal cell without
the classification breaking.

Conviction is tentative because two of the five declarations are exercised by no
real package, so their placement rests on reading code that nothing runs.

## Alternatives

- **One declaration registry** — rejected: it would have to be shaped for the
  producing case, taxing three suppressing declarations with plumbing they never
  reach, and it would flatten the suppress/produce difference that is the most
  load-bearing thing about the set.
- **Leave all five bespoke, name no axes** — rejected: it preserves the actual
  wiring, which is correct, but keeps the cost that prompted the question — a
  sixth declaration is still guessed at rather than classified.
- **Classify by phase (load / render / check)** — rejected: phase is downstream
  of what a declaration withholds, so a taxonomy built on it would sort
  declarations by a consequence rather than a cause, and would have nothing to
  say about the two that withhold nothing.
