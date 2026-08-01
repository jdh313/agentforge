---
id: "mfchxa"
title: Drive translators from the capability table's translation entries
status: current
decision_date: 2026-08-01
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/compatibility.ts
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - JUN-357
informed_by:
  - g6xvyk
---

# mfchxa — Drive translators from the capability table's translation entries

## Decision

Code that performs a translation reads which constructs to translate, and what
each becomes, from the capability table rather than restating either in a local
list or literal. Only the emitted content stays with the translator.

## Scope

- Binds: the frontmatter translation scan, the Codex hook environment rewrite, and
  the skill invocation-policy emitter.
- Does not bind: what a translator writes into the file it produces, which the
  table does not describe.

## Commitments

- The table is loaded at module scope by translators that derive rewrite rules
  from it, coupling their initialization to it.
- A translator may no longer name the construct it handles as a literal, so
  reading one now requires reading the table too.
- Adding a translation becomes a table edit, and any translator that needs a
  construct the table does not list has to add the row rather than work around it.

## Revisit if

- A translator needs translation rules the table cannot express, and the table
  starts growing fields that exist only to serve one target.
- Module-scope derivation from the table causes an initialization-order problem.

## Context

- The knowledge that `disable-model-invocation` becomes `agents/openai.yaml` was
  stated in two places once the table gained a translation entry: the table, and
  the emitter that wrote the file.
- The Codex hook rewrite kept its own literal list of Claude environment variables
  and their replacements.
- The compile diagnostic that reports a translation reads its wording from the
  table, so a divergence would have made the report state a destination the
  compiler did not use.

## Why

The reason the translated verdict was needed at all is that the same fact lived
in more than one place and drifted. Adding a table entry while leaving the
original literals in place would have reproduced that condition with an extra
copy, and the new copy is the one a reader trusts, because it is what the
diagnostic prints. A report that confidently names the wrong destination is worse
than the silence it replaced.

Marked tentative rather than strong: the principle has been applied to three call
sites in one target, and a target whose translator genuinely needs rules the
table cannot carry would be a fair reason to revisit rather than a violation.

## Alternatives

- **Keep the table descriptive and let translators hold their own rules** —
  rejected: the diagnostic reads the table, so the descriptive copy is the one
  users see, and a drift makes it lie.
- **Move the emitted content into the table too** — deferred: file contents are
  not a fact about target capability, and folding them in would make the table a
  code-generation store.
