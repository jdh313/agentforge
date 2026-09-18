---
id: "c5haze"
title: Detect an unregistrable collaborator reference against declared agent names
status: current
decision_date: 2026-09-18
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/compatibility.ts
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/23
  - docs/teach-runtime-acceptance.md
informed_by:
  - 5ymhmg
  - 728mf7
  - 8b6rtp
  - szdn5s
  - 37jcgx
---

# c5haze — Detect an unregistrable collaborator reference against declared agent names

## Decision

A body naming an agent the target does not register is a detected construct that requires a declared loss. The detector resolves each candidate name against the agents the same package declares, rather than against the shape of an `@` token.

## Scope

- Binds: the construct vocabulary and the body scanner.
- Does not bind: a name declared by a sibling package. Cross-package collaborator references stay undetected under this key, tracked separately.
- Does not bind: files a package declares under `documents:`. The document-class exemption applies unchanged.

## Commitments

- Detection now reads cross-artifact state within a package: an agent artifact's declared name informs a skill-body scan. No other construct family does this, and a future family wanting cross-artifact resolution goes through its own fork rather than inheriting this precedent.
- Completeness is bounded by what a package declares. A collaborator named in a body but declared nowhere in that package is not detected, and cannot become detectable without changing the key.

## Revisit if

- A second construct family needs declared-name resolution across artifacts.
- Cross-package collaborator references need gating rather than a hand-written declaration.
- A target gains plugin-bundled agent-role registration, which would make the loss conditional and move it outside the declared-loss gate.

## Context

- Codex does not register agent roles from a plugin package at codex-cli 0.154.0, and the shortfall is unconditional rather than enabled by a configuration option.
- The body scanner's construct families are shapes, and none of the six matches a bare `@name`.
- The single `@` matcher requires a path separator, added deliberately to keep prose mentions and email-shaped text out of the file-reference family.
- The declared-loss vocabulary is a closed list, so a `losses:` entry naming anything outside it fails validation.
- A package's agent artifacts already reach the detector alongside its skills and resources.
- A shipped package body names two collaborators that the Codex projection cannot resolve, and compilation reports nothing about either.

## Why

A body that instructs a model to dispatch a collaborator the runtime cannot resolve is a harder failure than a stripped tool filter: the instruction survives into output and the model acts on it, producing a fabricated dispatch rather than a degraded one. That loss is confirmed and unconditional, which places it squarely inside the gate that admits a construct only when its loss is unconditional — and being undeclarable there is the defect, not a deliberate silence.

Keying on declared names rather than on token shape is what makes the detector safe to add. The declaration already exists and already reaches the scanner, so the check is a lookup against known data with no heuristic in it: a name a package declares is a collaborator reference, and everything else is prose. That leaves the file-reference matcher's separator requirement untouched, which matters because that requirement is a deliberate exclusion with a stated reason, not an oversight to be corrected.

The construct is named for the reference it finds rather than for a harness that owns it, so the diagnostic reports that a named target does not accept the construct and asserts nothing about ownership.

Being wrong here is cheap in one direction and expensive in the other. An unnecessary family is one table row to delete. An absent one leaves a body shipping instructions that cannot execute, with neither compilation nor the publication check saying a word — the silence the declared-loss gate exists to end.

## Alternatives

- **Broaden the file-reference matcher to bare `@name`** — rejected: reverses a documented deliberate exclusion and fires on ordinary prose mentions, trading a silent miss for a noisy false positive.
- **Leave it documented only, relying on the limitations record** — rejected: a limitation nobody is forced to read reproduces the same silence in the next package that references an agent.
- **Report it as an unclassified construct** — rejected: that category is for a construct-shaped string the table cannot classify, and this one it can; it also never gates, so the unusable body still ships.
- **Resolve declared names across the whole publication** — deferred: it catches the motivating cross-package case but couples a package's diagnostics to its siblings' contents, which is its own fork.
