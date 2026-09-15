---
id: "2t36rb"
title: Use AGENT.md with explicit identity for file-layout canonical agents
status: current
decision_date: 2026-09-15
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/types.ts
  - src/schema.ts
  - src/render.ts
  - src/artifact-plan.ts
supersedes: []
superseded_by: []
derived_from:
  - docs/roadmap.md#08--canonical-agents
informed_by:
  - 9n1m1a
  - w3z7h3
  - msdg46
---

# 2t36rb — Use AGENT.md with explicit identity for file-layout canonical agents

## Decision

A first-class canonical agent is authored as one `AGENT.md` file with a required `name` identity and has file layout. The default one-file projection is named from that identity; target adapters may instead emit native registration sidecars or mark the artifact unsupported.

## Scope

- Binds: leaf-agent identity, source discovery, and default projected output layout.
- Does not bind: any target's native schema, filename extension, registration mechanism, or installation ownership contract.

## Commitments

- Source directories contain exactly one canonical `AGENT.md`, under the same one-artifact-per-directory rule as other leaf artifacts.
- Canonical agent identity comes from required `name` frontmatter, never from the source directory.
- Target adapters own any native translation that cannot be represented as a named Markdown file.

## Revisit if

- A representative runtime requires a directory-shaped agent as its only native registration form.
- Shared agent resources require a stable directory boundary that a named file cannot provide.

## Context

- Claude Code and OpenCode discover custom agents as individually named Markdown files.
- Codex registers roles through configuration entries that can reference separate TOML configuration layers.
- Current evidence establishes no core Pi registered-agent artifact, so Pi support remains explicitly unimplemented.
- The leaf renderer already distinguishes directory and file layouts and derives file-layout destinations from canonical artifact identity.
- The current installer owns and replaces a complete destination directory, which is unsafe for one agent file among siblings.

## Why

The common authoring unit across the two documented file-native runtimes is one named agent with one instruction body, while the filename used inside a canonical source directory should remain stable and independent of that agent's identity. Requiring identity in frontmatter makes the canonical document self-describing and prevents a directory rename from silently changing runtime identity. The existing file-layout projection then provides a fixed canonical input name and an identity-derived default output name.

This chooses only the canonical boundary. It does not force structurally different native registries through Markdown or make file creation stand in for runtime equivalence; those mappings remain target-owned and may emit additional files or reject unsupported semantics.

## Alternatives

- **Use each agent's final name as the canonical source filename** — rejected: artifact detection would lose its stable filename and source directories could no longer be inferred consistently.
- **Infer identity from the canonical source directory** — rejected: moving or vendoring a source directory would silently rename the agent, and the canonical document would not carry its own identity.
- **Use directory layout and emit `AGENT.md` unchanged** — rejected: it is not a common native shape, adds a redundant boundary for Claude, and changes OpenCode's path-derived identity unless its adapter flattens the output.
