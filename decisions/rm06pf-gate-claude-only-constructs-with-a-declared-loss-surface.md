---
id: "rm06pf"
title: Gate Claude-only constructs with a declared-loss surface
status: current
decision_date: 2026-07-30
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/compatibility.ts
  - src/definitions.ts
  - src/targets/package-payload.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-341
  - git:e2442a8
informed_by:
  - 2vv99y
---

# rm06pf — Gate Claude-only constructs with a declared-loss surface

## Decision

Detect Claude-only constructs at artifact-level compilation and require each one to carry a declared loss under `targets.<name>.losses` in canonical YAML. Fail compilation when a detected construct has no declaration.

## Scope

- Binds: constructs that carry meaning on Claude and have no equivalent on another target.
- Does not bind: Claude-only body template syntax, which the body-pattern check still owns.

## Commitments

- Name the construct, the artifact, and the file to declare it in when compilation fails.
- Keep the construct list and its declarations in canonical YAML, not in narrative documentation.
- Detect at artifact level, where frontmatter and configuration are visible.

## Revisit if

- The declared-loss surface proves too coarse for body-level constructs.
- A target needs per-artifact rather than per-package declarations.

## Context

- The body-pattern check reads skill bodies only and matches a fixed list of literal Claude template patterns.
- The constructs that matter are not body text: an agent tool allowlist is frontmatter, a command allowlist is frontmatter, and an MCP tool name is ordinary prose.
- An enumerated pattern list silently passes anything not listed, so absence of a match means nothing.

## Why

A declaration inverts the failure mode. An enumerated regex list is silent about what it does not know, so a new Claude-only construct ships unexamined and a target user loses behavior the source still claims. Requiring the package to declare the loss makes the unknown case loud: an undeclared construct stops the build rather than compiling into output that misrepresents runtime support.

## Alternatives

- **Extend the body-pattern regex list** — rejected: structurally body-only, and it cannot see frontmatter or configuration at all.
- **Emit a warning instead of failing** — rejected: warnings are the silence this replaces.
