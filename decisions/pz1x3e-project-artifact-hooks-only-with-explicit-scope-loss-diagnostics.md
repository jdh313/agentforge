---
id: "pz1x3e"
title: Project artifact hooks only with explicit scope-loss diagnostics
status: current
decision_date: 2026-09-21
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
  - write-side
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - "Fibery #132"
informed_by:
  - wvs5an
  - 3qqk1d
---

# pz1x3e — Project artifact hooks only with explicit scope-loss diagnostics

## Decision

During Codex marketplace compilation, project every canonical skill or agent `hooks:` declaration into its own package-level hook configuration and manifest entry. Emit a warning that the declaration's activation scope widened; standalone leaf rendering continues to drop it with a warning, and native package hook artifacts retain their existing route.

## Scope

- **Binds:** Codex marketplace compilation of inline `hooks:` frontmatter on canonical skill and agent artifacts.
- **Does not bind:** Claude projection, standalone Codex leaf rendering, or native package `hook` artifacts.

## Commitments

- Keep each artifact's projected hooks in a separate file rather than merging configurations, so source ownership remains inspectable and event keys cannot collide during compilation.
- Report the widened activation scope on every compile; producing a runnable hook does not make the projection semantically lossless.
- Reuse the established Codex hook translator for event filtering, command rewriting, timeout handling, trust messaging, and diagnostics.

## Revisit if

- Codex gains skill-scoped or agent-role-scoped lifecycle hooks.
- A package-level projection can preserve the source activation boundary mechanically.
- Runtime evidence shows that multiple manifest hook paths do not load additively.

## Context

- Claude skill hooks register when the skill is invoked and then remain active for the session.
- Claude agent hooks run only while that agent is active.
- Codex plugin hook configurations are package-level and can be declared as multiple manifest paths.
- AgentForge already translates native package hook artifacts, but canonical artifact frontmatter hooks are currently dropped.

## Why

Separate package hook files preserve the declaration and its source identity without pretending Codex can retain Claude's activation boundary. The warning is load-bearing: package-wide execution can affect unrelated skills, agents, and main-thread work, so a runnable output alone would overstate parity. Restricting this projection to marketplace compilation keeps standalone leaf output honest because that path has no package owner or manifest in which the hook can land.

The existing native hook translator already owns Codex event vocabulary and handler-shape adaptation. Reusing it avoids a second hook implementation while leaving native package artifacts on their target-local route, consistent with `wvs5an`.

## Alternatives

- **Drop canonical artifact hooks on Codex everywhere** — rejected: Codex has a runnable package hook surface, and an explicit warning can expose the remaining scope loss.
- **Merge all artifact hooks into one generated file** — rejected: merging erases source ownership and introduces avoidable event-key collision policy.
- **Project hooks during standalone leaf rendering** — rejected: that path has no package manifest or honest destination for package-level lifecycle configuration.
