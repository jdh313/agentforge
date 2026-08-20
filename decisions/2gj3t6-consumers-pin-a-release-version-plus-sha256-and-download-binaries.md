---
id: "2gj3t6"
title: Consumers pin a release version plus sha256 and download binaries
status: current
decision_date: 2026-08-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - deployment
  - ci-strategy
binds: []
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# 2gj3t6 — Consumers pin a release version plus sha256 and download binaries

## Decision

Consumer repos consume agentforge by pinning a release version and a sha256 checksum, downloading the platform binary from the GitHub release, and verifying it against the attached `SHA256SUMS` — not by checking out the agentforge repo at a commit SHA and running it from source.

## Commitments

- Every release must attach working binaries plus `SHA256SUMS`; a release without them strands consumers.
- Consumers take an explicit two-line bump (version + checksum) to adopt a new release; nothing floats.
- Released binaries are immutable: re-uploading a changed asset under the same tag breaks every consumer's checksum.

## Revisit if

- Supply-chain requirements harden to demand signed provenance (cosign / GitHub artifact attestations) beyond a checksum.
- A consumer platform appears that no released binary covers.

## Context

- Consumer CI (ndr, jdh-agents, clearance-driven-dev) checked out agentforge at a pinned commit and ran `bun install` plus `bun run src/cli.ts` on every job.
- The private-consumer path (jdh-agents) additionally needed a deploy key just to perform that checkout.
- Source-checkout consumption rebuilds the tool on every CI run and couples consumers to the repo's toolchain.

## Why

An immutable pin was non-negotiable; the question was its form. Version + checksum keeps the immutability of a SHA pin while removing the checkout, the Bun toolchain, and the deploy key from consumer CI, and makes bumps legible ("0.2.0 → 0.3.0" instead of hash soup). The checksum guards against tag movement and download corruption at the cost of one extra line per bump.

## Alternatives

- **Commit-SHA checkout + build from source (status quo)** — rejected: slow consumer CI, toolchain coupling, deploy key needed for private access paths.
- **Version pin without checksum** — rejected: a moved tag or corrupted download would pass silently for one line saved.
- **Checksum plus cosign/attestation verification** — deferred: real hardening, but overkill for first-party consumers today.
