---
id: "m5jy88"
title: Keep Claude native validation opt-in
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - tooling
  - read-side
binds:
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-306
informed_by:
  - 17dhph
---

# m5jy88 — Keep Claude native validation opt-in

## Decision

AgentForge's internal marketplace and target-schema validation always runs. The external `claude plugin validate --strict` acceptance check runs only when the caller supplies `--claude-native`.

## Scope

- **Binds:** the marketplace check CLI's invocation of the external Claude validator.
- **Does not bind:** internal Claude or Codex document validation.

## Commitments

- Keep internal validation deterministic and enabled by default.
- Do not auto-detect and invoke `claude` merely because it is on `PATH`.
- Surface native Claude validation failures when the explicit option is selected.

## Revisit if

- The native validator becomes bundled and version-pinned with AgentForge.
- Internal validation is removed in favor of a required native acceptance tool.

## Context

- The Claude CLI is an external dependency and is not required to run AgentForge.
- Installed Claude versions can differ in accepted schema details and warning behavior.
- Codex validation remains implemented against target-owned schemas inside AgentForge.

## Why

An explicit option keeps default checks portable and reproducible while still allowing callers to demand acceptance by the installed Claude toolchain.

## Alternatives

- **Automatically invoke Claude when found on `PATH`** — rejected: identical inputs could produce different results across machines.
