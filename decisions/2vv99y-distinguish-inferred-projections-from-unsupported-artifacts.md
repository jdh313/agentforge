---
id: "2vv99y"
title: Distinguish inferred projections from unsupported artifacts
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/compiler.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - git:0697ff2
informed_by:
  - wvs5an
---

# 2vv99y — Distinguish inferred projections from unsupported artifacts

## Decision

Use `inferred-artifact-projection` when a translator produces a usable target artifact with unenforced or inferred semantics, and reserve `unsupported-artifact-projection` for source declarations with no target translator. Both diagnostics retain source provenance.

## Scope

- Binds: nonfatal package-artifact translation diagnostics.
- Does not bind: invalid source documents or fatal compilation-plan integrity errors.

## Commitments

- Name lost or unenforced behavior in the user-facing diagnostic message.
- Attach artifact type and source path to both inferred and unsupported results.
- Preserve deterministic diagnostic ordering through the shared compilation plan.

## Revisit if

- Diagnostics gain structured inference and loss fields beyond code, message, and retained source.
- Consumers need severity to distinguish usable inference from source-only retention.

## Context

- Some target translators can produce a usable output without preserving every source-runtime constraint.
- Other artifact types have no translator and remain available only through their source declaration.
- A package compilation may still be valid when either condition occurs.

## Why

Separate diagnostic codes tell callers whether AgentForge produced a native artifact or only retained the source, while shared provenance keeps both cases inspectable. This avoids treating lossy-but-usable inference as total lack of support and prevents silent omission without turning expected translation gaps into compilation failures.

## Alternatives

- **One generic translation warning** — rejected: callers could not tell whether a target artifact was emitted.
- **Fail compilation on any lost behavior** — rejected: partial translations and unsupported payloads would make otherwise usable packages unavailable.
