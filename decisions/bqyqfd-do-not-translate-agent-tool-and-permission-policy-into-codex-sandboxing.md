---
id: "bqyqfd"
title: Do not translate agent tool and permission policy into Codex sandboxing
status: current
decision_date: 2026-09-21
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - "Fibery #130"
  - https://developers.openai.com/codex/config-reference
informed_by:
  - 0jd29k
  - 61cmc9
  - 728mf7
---

# bqyqfd — Do not translate agent tool and permission policy into Codex sandboxing

## Decision

Treat canonical agent `tools`, `disallowedTools`, and `permissionMode` as permanent losses on Codex rather than translating any of them into `sandbox_mode` or another adjacent configuration field.

## Scope

- **Binds:** Cross-target projection of the three source agent-policy fields into Codex agent roles.
- **Does not bind:** Codex-native target configuration authored explicitly for Codex, which may expose sandbox and approval controls under a separate contract.

## Commitments

- Classify all three field-parity rows as No analogue instead of leaving an unimplemented translation implied by Blocked.
- Keep stripping and reporting the source fields; do not synthesize filesystem, network, approval, or tool settings from them.
- Treat an explicit Codex-native sandbox or approval surface as a separate future feature, never as evidence that the source fields became translatable.

## Revisit if

- Codex adds role-scoped named-tool allowlists and denylists with the same inherited-tool semantics.
- Codex adds a role-scoped permission policy with a documented, total mapping from the source vocabulary.

## Context

- The source runtime's `tools` and `disallowedTools` fields select individual tools from an inherited catalog.
- The source runtime's `permissionMode` controls approval behavior using source-specific modes.
- Codex documents sandbox configuration as filesystem and network policy during command execution.
- Codex keeps sandbox capability and approval behavior as separate configuration axes.
- The current parity table marks all three rows Blocked against the same adjacent destination even though no implementation can preserve their operations.

## Why

The operation is the contract. A named tool filter determines whether an agent can invoke a particular shell, MCP, browser, or other tool; a sandbox determines what command execution may read, write, or reach over the network. Tightening one cannot preserve the other. An apparently conservative translation would still either leave a forbidden tool callable or remove unrelated capabilities the source allowed.

Permission behavior fails for the same structural reason. Source modes combine interaction and approval choices that Codex models on different axes, and similarly named postures do not guarantee the same decision points. A partial value-by-value mapping would therefore make output look enforced while changing when the child can act or must ask.

Calling the fields No analogue closes the false implementation path without preventing Codex-native configuration. An author who intends a Codex sandbox or approval policy can state that policy directly in a future target-specific surface; the compiler must not infer it from declarations whose operations differ.

## Alternatives

- **Map all three fields to `sandbox_mode`** — rejected: filesystem and network restrictions cannot express named-tool availability or source approval semantics.
- **Translate only apparently similar values** — rejected: a partial mapping makes the same canonical field change meaning by value and leaves the unsupported cases looking like edge conditions rather than a semantic mismatch.
- **Leave the rows Blocked indefinitely** — rejected: Blocked implies an implementation candidate exists, while the documented destination cannot preserve the source operations.
