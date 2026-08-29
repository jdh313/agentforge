---
id: "tgxck9"
title: Port only runtime failures from a consumer's linter
status: current
decision_date: 2026-08-29
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - write-side
binds:
  - src/check.ts
supersedes: []
superseded_by: []
derived_from:
  - https://github.com/jdh313/agentforge/pull/18
informed_by:
  - 17dhph
---

# tgxck9 — Port only runtime failures from a consumer's linter

## Decision

A check absorbed from a consuming repository's own tooling is adopted only when
the condition it detects would fail at load time on a target harness. A rule
expressing that repository's house style stays with that repository.

## Scope

- Binds: which checks move from a consumer's tooling into the compiler.
- Does not bind: how an adopted check is implemented or reported.

## Commitments

- Adopting a check requires naming the harness behavior that fails without it.
- A rejected rule is pinned by a test asserting the tolerance, so a later
  contributor cannot reintroduce it as an oversight.
- Consumers keep their own hooks for the rules that do not move, and the
  compiler does not try to replace them wholesale.

## Revisit if

- Every consuming repository converges on the same house-style rule, making it a
  property of the format rather than of one repository.

## Context

- A consuming repository ran a linter whose rules mixed correctness checks with
  style preferences: malformed JSON, but also empty markdown files, files under
  fifty characters, and an allowlist of file extensions.
- A malformed JSON file is parsed by both target harnesses at load time.
- An empty or short markdown file loads without complaint on both harnesses.
- The compiler is consumed by repositories whose house styles are not related to
  each other.
- An earlier decision had already rejected strict target schemas for making
  harmless platform additions fail compilation.

## Why

The compiler's failures are every consumer's failures, so the bar for adding one
is whether the artifact is actually broken — not whether it offends the
conventions of the repository the check came from. Running the same test twice
makes the line concrete: malformed JSON is rejected by the harness, so the
compiler can say so with authority; an empty markdown file is not, so a compiler
that failed on it would be inventing a defect. This is the same reasoning that
kept target schemas open, applied to checks rather than to fields.

## Alternatives

- **Port the linter wholesale** — rejected: makes one repository's house style
  every consumer's build error.
- **Port nothing and leave all linting to consumers** — rejected: drops genuine
  correctness checks the compiler is best placed to run, since it knows exactly
  which files it emitted.
- **Port style rules as warnings rather than errors** — deferred: `check` has no
  warning severity, and adding one to carry rules of this grade is not worth the
  surface.
