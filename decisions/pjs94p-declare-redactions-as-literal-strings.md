---
id: "pjs94p"
title: Declare redactions as literal strings
status: current
decision_date: 2026-08-29
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - https://github.com/jdh313/agentforge/pull/18
informed_by:
  - 4nshwv
---

# pjs94p — Declare redactions as literal strings

## Decision

A marketplace's `redactions:` block holds literal strings, matched by substring.
Patterned classes that generalize across every repository are built into the
compiler instead, where they are tested once.

## Scope

- Binds: the `redactions:` declaration and what a marketplace may put in it.
- Does not bind: the built-in detectors, which may use whatever matching their
  class requires.

## Commitments

- A patterned leak class may only ship as a built-in, which means arguing it
  generalizes to every repository before it is added.
- The compiler never infers which strings are sensitive; an undeclared string is
  not a finding.

## Revisit if

- A repository has a sensitive vocabulary that literal strings genuinely cannot
  express, and the case is not served by adding a built-in detector.

## Context

- Which strings are sensitive is a property of the repository publishing them,
  not of the artifacts being compiled.
- The consumer implementation this replaces used regexes for both its
  repository-specific terms and its generic classes.
- `authoring-keys` and `documents:` had already established declaration over
  inference for repo-local vocabulary the compiler has no business knowing.
- An absolute home directory is the one leak class present in every repository
  regardless of its subject matter.

## Why

A declaration names a vocabulary, and a vocabulary is a list. Accepting a regex
would move matching logic into the declaration, and the compiler would then have
to defend against what an author wrote there — catastrophic backtracking, and
silent over-match that fails a build over a word that merely looks private. The
split also puts the burden in the right place: a generic pattern earns its
correctness once, in code with tests, rather than being re-derived in every
marketplace that needs it.

## Alternatives

- **Accept author-supplied regexes** — rejected: imports matching logic, and its
  failure modes, into a declaration.
- **Infer sensitive strings from the environment** — rejected: guessing intent is
  exactly what a declaration exists to avoid.
- **Ship no built-ins and declare everything** — rejected: every marketplace
  would restate the home-directory pattern, and one would get it wrong.
