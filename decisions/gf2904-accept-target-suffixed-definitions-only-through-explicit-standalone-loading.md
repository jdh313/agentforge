---
id: "gf2904"
title: Accept target-suffixed definitions only through explicit standalone loading
status: current
decision_date: 2026-10-12
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
binds:
  - src/definitions.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - nt12pb
---

# Accept target-suffixed definitions only through explicit standalone loading

## Decision

The explicit standalone package loader accepts PACKAGE.yaml and PACKAGE.<registered-target>.yaml. A suffix must match the selected target. package compile/check use this loader; loadPackageDefinition and marketplace loading remain canonical-only.

## Commitments

- Resolve sources relative to the actual definition's containing directory and retain its resolved path as provenance. Never rename/stage the definition or copy its source tree to satisfy filename validation.
- Target suffixes do not create target capabilities, imply automatic enrollment, filter shared artifacts, or merge adjacent definitions. Pi remains the only standalone package compiler.
- Marketplace patterns still require canonical PACKAGE.yaml matches; a pattern that includes an alternate definition still fails rather than silently ignoring it.
- Preserve artifact/payload containment, symlink refusal, overlap safeguards, native resource validation, and canonical skill projection.

## Context

A plugin's canonical definition can contain shared hook artifacts that Pi cannot translate. An adjacent Pi definition can select the existing canonical skills and supplied native Pi code without changing Claude/Codex behavior or duplicating source files. The original strict filename gate prevented this explicit selection.

## Alternatives

- Relax all package loading: rejected because it changes marketplace discovery/validation and can introduce duplicate enrollment.
- Accept arbitrary YAML names: rejected because registered-target suffixes provide a small, explicit vocabulary.
- Treat the suffix as an unconstrained label: rejected because selecting a different target would conceal a likely authoring error.
- Add target-specific artifact filtering: outside this change's scope.

## Revisit if

Standalone compilation gains target-selection inference or marketplace enrollment deliberately supports alternate package definitions.
