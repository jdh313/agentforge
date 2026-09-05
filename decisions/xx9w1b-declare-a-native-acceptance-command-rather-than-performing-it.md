---
id: "xx9w1b"
title: Declare a native acceptance command rather than performing it
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - tooling
  - architecture
binds:
  - src/cli.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/20
informed_by:
  - m5jy88
  - gwxcfm
---

# xx9w1b — Declare a native acceptance command rather than performing it

## Decision

A target that offers an external acceptance check declares the command to run as data on its adapter. The CLI spawns whatever a target declares and inspects nothing about it; a target declaring none contributes no pass, and the flag that enables the checks names no target.

## Scope

- Binds: the external validator invocation in the CLI and the adapter member that supplies it.
- Does not bind: whether the checks run at all, which stays opt-in behind an explicit flag.
- Does not bind: agentforge's own internal validation, which always runs.

## Commitments

- Adapters stay pure: they supply data and accessors and perform no process execution.
- Enabling native acceptance runs every target's declared check, so a second target offering one costs no shared edit.
- The enabling flag is named for what it does rather than for the one target that first had a check, with the old spelling kept as an alias if compatibility warrants.
- An external tool is never invoked merely because it is on PATH.

## Revisit if

- A target's acceptance check needs more than an argument vector, such as a required working directory, staged inputs, or interpretation of its output.
- Two targets' checks need to run under different conditions, making one flag the wrong granularity.

## Context

- The CLI filters publications to a single named target and spawns that vendor's binary with a fixed argument vector.
- The enabling flag is itself named after that one target.
- The placement rule filed this exact call as a revisit trigger, describing it as host-specific invocation no other target can express.
- Codex, hermes, and openClaw each ship a command-line tool, and three of the prospective targets are marketplace-capable.
- An existing decision keeps native validation opt-in and forbids auto-detection, for reproducibility across machines.
- Every other per-target member settled in this area supplies data or pure accessors.

## Why

Nothing about spawning a subprocess needs a target's judgement; only the argument vector does. Once that is seen, the target has one thing to contribute and the CLI has one thing to do, and neither needs to know the other's identity — the CLI holds an argv it never inspects, which is carrying rather than branching.

Leaving the call named is cheap today and compounds badly. Each additional target with a validator would arrive with its own flag and its own filter, so the shared file accumulates one branch per target, which is the pattern this whole effort exists to remove. Declaring the command converts a standing exception into a closed case.

An effectful adapter member was the alternative that seemed most direct and gives away the most. Every other member settled here is pure, and permitting one target to run processes makes the adapter a place where arbitrary behaviour can hide, in exchange for expressiveness nothing currently needs.

The opt-in gate is untouched. What that decision protects is reproducibility — no auto-detection, no invocation unless asked — and none of that depends on the flag naming a vendor.

Conviction is tentative because the argument vector is the only shape any current check needs, and one target wanting staged inputs or output interpretation would exceed what data can express.

## Alternatives

- **Expose an effectful check the adapter runs itself** — rejected: it makes adapters process-spawning for the first time, a large capability bought for expressiveness nothing needs.
- **Leave the invocation in the CLI as a documented exception** — rejected: defensible for one target and adds a branch per target thereafter, in the file the effort is trying to keep case-free.
