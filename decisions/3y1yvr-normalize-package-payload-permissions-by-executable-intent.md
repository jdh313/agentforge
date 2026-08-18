---
id: "3y1yvr"
title: Normalize package payload permissions by executable intent
status: current
decision_date: 2026-07-19
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - architecture
binds:
  - src/package-payload-plan.ts
  - src/materializer.ts
supersedes: []
superseded_by: []
derived_from:
  - shortcut:SC-31
informed_by: []
---

# 3y1yvr — Normalize package payload permissions by executable intent

## Decision

Package payload compilation preserves only whether a source is executable. Materialization writes executable payloads with mode `0755` and non-executable payloads with mode `0644`.

## Commitments

- Payload plans carry executable intent rather than host-specific permission bits.
- Repeated materialization must produce the same payload modes across supported hosts.

## Revisit if

- A supported target requires finer-grained packaged permissions than executable versus non-executable.
- AgentForge must preserve group- or owner-specific write policy in compiled artifacts.

## Context

- Source modes can include host-specific owner, group, umask, ACL, and platform details.
- Executable scripts need their runtime behavior preserved after compilation.
- Reproducible output trees require permission behavior independent of the build host.

## Why

Executable intent is the portable semantic distinction consumers need. Normalizing the remaining bits avoids leaking build-machine policy into generated marketplaces while retaining runnable scripts and deterministic output modes.

## Alternatives

- **Copy the complete source mode** — rejected: host-specific permission policy would make output vary across environments.
- **Write every payload as non-executable** — rejected: scripts would lose required runtime behavior.
