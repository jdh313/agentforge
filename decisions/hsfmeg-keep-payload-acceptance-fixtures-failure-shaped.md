---
id: "hsfmeg"
title: Keep payload acceptance fixtures failure-shaped
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - process
  - write-side
binds:
  - tests/fixtures/definitions/**
  - tests/fixtures/expected/**
  - tests/cli.test.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - 2z51xz
  - 3y1yvr
  - 8e8bc7
  - 7rmqea
---

# hsfmeg — Keep payload acceptance fixtures failure-shaped

## Decision

Represent payload fidelity with minimized failure shapes inside the canonical five-package marketplace corpus. Commit the complete generated Claude and Codex trees as golden files, and compare every path, byte, and canonical permission mode.

## Commitments

- Keep each required payload category legible in the source fixture instead of depending on incidental files from a full plugin checkout.
- Regenerate and review the complete golden trees when compiler output changes intentionally.
- Run external native validators as read-only acceptance gates without making them hermetic unit-test dependencies.

## Revisit if

- A real plugin failure cannot be reduced without losing the behavior that caused it.
- The golden trees become too large or noisy to review reliably.
- Native validator compatibility requires version-pinned fixtures or CI-owned toolchains.

## Context

- The canonical marketplace fixture already represents five packages and both Claude and Codex publications.
- Payload regressions can preserve the same path list while changing bytes or executable intent.
- The full cc-marketplace corpus contains more plugins and semantic concerns than this payload-fidelity epic owns.

## Why

Failure-shaped fixtures isolate the filesystem behaviors the compiler promises while retaining realistic package wiring. Complete golden trees expose collateral output changes and make reviews concrete; enrolling every real plugin would mix payload fidelity with unrelated translation and semantic-parity failures.

## Alternatives

- **Mirror full real plugins** — rejected: unrelated package evolution would create noisy failures outside payload fidelity.
- **Assert only selected paths** — rejected: dropped or unexpectedly generated files would remain invisible.
- **Snapshot hashes only** — rejected: compact failures are less reviewable because the changed output is not directly inspectable.
