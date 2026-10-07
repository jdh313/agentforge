---
id: "csj8pa"
title: Leave Claude's observer agent keys unrecognized until official docs list them
status: current
decision_date: 2026-10-07
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - scope
  - write-side
binds:
  - src/schema.ts
  - docs/field-parity.md
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking task #135"
informed_by: []
---

# csj8pa — Leave Claude's observer agent keys unrecognized until official docs list them

## Decision

The canonical agent schema does not enumerate `observer`, `observerMessage` or `observeSubagents`. A source that writes one keeps the current outcome: `unrecognized-frontmatter-key` on every target, and the key stripped on Claude too.

## Scope

- Binds: `CanonicalAgentFrontmatter` and the Claude agent acceptance table.
- Does not bind: any other key Claude Code's loader reads without documentation, each of which needs its own call.

## Commitments

- The evidence bar is publication: all three keys appear in the official Claude Code sub-agents frontmatter reference or its changelog.
- Being present in the shipped loader, gated behind an experimental environment variable, does not meet the bar.
- The `docs/field-parity.md` Unmapped row cites this decision and the experimental gate.

## Revisit if

- The official sub-agents frontmatter reference or changelog documents any of the three keys.
- Claude Code removes the `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS` gate and enables observer agents by default.
- An author needs observer agents and the reported strip blocks real work.

## Context

- Claude Code 2.1.293's agent loader validates all three keys and carries a description for each: `observer` names a watching agent type, `observerMessage` appends text to each activity digest, and `observeSubagents` extends observation to nested subagents.
- The same binary enables observer agents only when `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS` is set and the `tengu_observer_agents_enabled` feature flag is on.
- The official sub-agents page lists 18 frontmatter fields on 2026-10-07, none of them observer keys; third-party blog posts describe the feature as undocumented.

## Why

Emitting a key is a claim that the target accepts it as a contract. An experiment behind an environment variable and a remote flag can change shape or disappear between releases, and agentforge would then ship a key it vouched for into a loader that rejects or ignores it. The current report already tells an author the key did not survive, which is honest about the state of the feature.

## Alternatives

- **Enumerate the keys from the loader's own schema** — rejected: the binary shows what the experiment reads today, not what Anthropic commits to.
- **Pass them through on Claude without enumerating** — rejected: breaks the rule that an unrecognized key is stripped on every target, Claude included.
