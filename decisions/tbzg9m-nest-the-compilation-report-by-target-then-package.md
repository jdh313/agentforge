---
id: "tbzg9m"
title: Nest the compilation report by target, then package, over one shared structure
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - read-side
  - write-side
binds:
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - .docs/2026-08-09-compilation-report-companion.md decision-log rows 4 and 9
informed_by: []
---

# tbzg9m — Nest the compilation report by target, then package, over one shared structure

## Decision

Every compilation report format nests diagnostics by target, then by package,
over one shared structure. Diagnostics carrying no package id sit under a
sibling `publication` key rather than a synthetic package entry.

## Scope

- Binds: all report formats, present and future.
- Does not bind: the terminal diagnostic stream, which stays a flat sequence.

## Commitments

- A new format renders the existing structure; it does not define its own.
- A consumer may assume every key under `packages` is a real package id.
- Target stays a grouping level even while only one target reports, so adding a
  second one is a new key rather than a reshape.
- The `publication` key must be omitted rather than emitted empty, so its
  presence always means something was found.

## Revisit if

- A consumer routinely flattens the grouping back out on read.
- Publication-level diagnostics need subdividing below the package level.

## Context

- The report ships in two formats — JSON for machine consumers, markdown for
  reading — over the same diagnostic set.
- `provenance.packageId` is optional; publication-level diagnostics carry none.
- A package id is author-chosen, so any reserved name the compiler invents can
  collide with a real one.
- A flat array is cheaper to query with `jq` and diffs more cleanly across two
  compiles than a nested structure does.

## Why

One structure across formats means one thing to keep correct. The alternative
put a flat array in JSON and grouping in markdown, which reads as a small
convenience but makes the two formats drift independently — every later addition
has to be designed twice and can silently land in only one.

For the package-less case, a sibling key beats a reserved package name because
it cannot collide and it does not force every consumer to special-case one
member of `packages`. A synthetic `_unscoped` entry would make the common
iteration — walk every package — quietly wrong for anyone who forgot the
exception.

The query and diff cost is real and accepted. It is paid once per read, by a
consumer that can write the extra selector; the drift cost of two shapes is paid
on every future change to the report, by whoever forgets the second one.

## Alternatives

- **Flat array plus a counts object in JSON, grouping only in markdown** —
  rejected: easier to query and diff, but two shapes for one report is a second
  thing to keep in sync.
- **A synthetic `_unscoped` package entry** — rejected: collides with a real
  package id and makes every consumer special-case one member of `packages`.
