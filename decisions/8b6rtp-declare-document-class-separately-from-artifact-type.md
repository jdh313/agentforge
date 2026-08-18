---
id: "8b6rtp"
title: Declare document class separately from artifact type
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-353
informed_by:
  - 2vv99y
---

# 8b6rtp — Declare document class separately from artifact type

## Decision

A package declares document class in its own `documents` block, naming a class and a pattern. Class marks whether a file's Claude-only constructs are described or invoked, and is never inferred from artifact type or file path.

## Scope

- Binds: which files are exempt from construct scanning.
- Does not bind: whether a file projects to a target, which artifact type owns.

## Commitments

- Class is author-asserted per file, never derived from location.
- A class name states why a file is exempt, so the exemption stays readable rather than becoming an opaque skip list.
- Adding a class means extending this block, not overloading the artifact type vocabulary.

## Revisit if

- A file needs to be partly exempt rather than wholly exempt.
- Classes multiply past the point where an author can tell which one applies.

## Context

- Some documents name a target's tool identifiers because the identifier is the content: a reference recording that a specific parameter value fails silently, or a check asserting a specific endpoint is reachable.
- Rewriting those to describe intent reproduces the very failure the document exists to warn about.
- Distinguishing a call site from prose describing one is a lexical judgment, and both shapes occur in the same corpus.
- Artifact type already exists as an open, package-defined vocabulary, and drives projection.

## Why

The two properties vary independently. A file can be projectable and scan-exempt, projectable and scanned, or neither, so fusing them into one field makes some combinations unrepresentable and misreports others. Declaring an exempt file as an artifact type would additionally emit a diagnostic claiming a missing translator for a file that was never meant to translate.

Moving the judgment from per-occurrence to per-file also moves it from a machine inference to an author assertion. A regex guessing whether a string is invoked or discussed will be wrong in both directions; an author declaring what a document is for will not.

## Alternatives

- **An artifact type entry for exempt files** — rejected: fuses projectability with scan exemption and produces a spurious unsupported-projection diagnostic.
- **Path convention** — rejected: fails both directions, since a scanned directory holds exempt files and an exempt document can sit at an ordinary path.
- **Per-document frontmatter key** — rejected: resource files carry no guaranteed frontmatter.
