---
id: "71jgk2"
title: Organise reports by disposition rather than severity
status: current
decision_date: 2026-08-09
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - read-side
  - architecture
binds:
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - ".docs/2026-08-09-compilation-report-companion.md — amendment to Fibery #31"
informed_by:
  - szdn5s
  - 4nshwv
---

# 71jgk2 — Organise reports by disposition rather than severity

## Decision

A report groups and leads with disposition — what became of the thing — rather
than with severity. Disposition is derived from the diagnostic code at render
time and is never stored on the diagnostic itself.

## Scope

- Binds: every report format.
- Does not bind: the terminal diagnostic stream, which stays severity-prefixed,
  and the diagnostic shape, which gains no field.

## Commitments

- Every diagnostic code needs a disposition mapping, and a new code without one
  reports as not-established rather than as a loss or a non-loss.
- Disposition ordering runs confirmed-loss to unknown and must not be
  alphabetized; the order is the scale.
- Severity stays in the report as a secondary count, so nothing a reader could
  previously see is lost.

## Revisit if

- Severity is redefined to track what became of a construct.
- A reader needs to filter by how loud a diagnostic is rather than by what
  happened to the thing.

## Context

- Severity has two values, note and warning, chosen for how loudly a diagnostic
  should read.
- `declared-loss` carries note severity and describes a construct that was
  destroyed; `translated-construct` also carries note severity and describes one
  that survived.
- `unclassified-construct` carries warning severity while asserting only that
  nothing has been established about the construct.
- The question a reader brings to a report is what did not survive the
  translation.
- On the fourteen-package corpus, an undifferentiated 182 diagnostics resolve to
  93 undeclared losses, 13 declared, 48 carried, and 28 never ruled on.

## Why

Severity answers a different question than the one a report is opened to
answer, and answers it in a way that actively misleads. Filing a confirmed loss
beside a non-loss because both are notes is not a presentation weakness; it
tells the reader the two are the same kind of thing.

Deriving disposition rather than storing it keeps the compiler unaware that
reports exist, which is the same separation the counts already rely on. It also
means the mapping can be corrected without touching a single diagnostic
emitter.

Resolving an unmapped code to not-established rather than to a loss is the same
discipline the capability table already applies to unclassified constructs: the
cost of wrongly claiming a loss is a false alarm that trains readers to ignore
the category, and the cost of wrongly claiming safety is a silent gap. Neither
is acceptable, so the honest third answer is the only one available.

## Alternatives

- **Keep severity as the organising axis** — rejected: it files a confirmed loss
  beside a non-loss, which is the defect that prompted the change.
- **Store disposition on the diagnostic at emission** — rejected: pushes a
  presentation concern into every emitter and makes the mapping unfixable
  without touching them all.
- **Add disposition as a filter but keep severity grouping** — rejected: leaves
  the misleading grouping in place as the default reading.
