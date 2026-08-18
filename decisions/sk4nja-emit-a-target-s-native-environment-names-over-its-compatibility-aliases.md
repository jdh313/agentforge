---
id: "sk4nja"
title: Emit a target's native environment names over its compatibility aliases
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
binds:
  - src/targets/codex-marketplace.ts
supersedes: []
superseded_by: []
derived_from:
  - git:5192aad
informed_by:
  - 2vv99y
---

# sk4nja — Emit a target's native environment names over its compatibility aliases

## Decision

Rewrite Claude's plugin-root and plugin-data environment references to the target's native equivalents in generated output, rather than relying on the target's documented legacy aliases.

## Scope

- Binds: environment references inside translated hook commands.
- Does not bind: source files retained verbatim, or references inside supplied payload scripts.

## Commitments

- Rewrite both the plugin-root and plugin-data references together.
- Keep rewritten references expandable through any quoting applied afterward.

## Revisit if

- The target deprecates its compatibility aliases, which would make this required rather than preferred.
- The target introduces a root variable whose resolution semantics differ from the alias it replaces.

## Context

- The target documents its own plugin-root and plugin-data names as native and the Claude-prefixed pair as legacy compatibility aliases.
- The aliases work today, and the target's own published plugins still ship them.
- This output is freshly generated rather than inherited.

## Why

Generated output has no reason to depend on a compatibility shim. An alias exists to keep hand-written artifacts working across a rename; a compiler emitting the aliased form takes on that dependency for nothing, and leaves output whose vocabulary belongs to the wrong runtime. Emitting the native name costs one substitution and keeps the generated artifact idiomatic for the target that consumes it.

## Alternatives

- **Rely on the documented legacy alias** — rejected: depends on a compatibility shim for freshly generated output, though the alias is not at risk today.
- **Leave references untouched and document the mismatch** — rejected: pushes a translation the compiler can do onto every reader.
