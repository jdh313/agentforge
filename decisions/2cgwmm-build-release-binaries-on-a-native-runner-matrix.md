---
id: "2cgwmm"
title: Build release binaries on a native-runner matrix
status: superseded
decision_date: 2026-08-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - ci-strategy
  - deployment
binds:
  - .github/workflows/release.yml
supersedes: []
superseded_by:
  - m5qyvk
derived_from: []
informed_by: []
---

# 2cgwmm — Build release binaries on a native-runner matrix

## Decision

Release binaries are compiled with `bun build --compile` on one native GitHub runner per platform — linux-x64, linux-arm64 (`ubuntu-24.04-arm`), darwin-x64 (`macos-15-intel`), darwin-arm64 — rather than cross-compiled from a single host.

## Commitments

- Four runner jobs per release, including macOS minutes.
- macOS builds set `BUN_NO_CODESIGN_MACHO_BINARY=1` and ad-hoc `codesign` explicitly (oven-sh/bun#29120 workaround); dropping either yields broken binaries.
- The darwin-x64 row rides `macos-15-intel`, GitHub's last x64 macOS label — it must be dropped or replaced when that label retires (announced Fall 2027).

## Revisit if

- bun's cross-compilation to macOS and cross-libc targets becomes reliable, collapsing the matrix to one runner.
- GitHub retires `macos-15-intel`, forcing a call on whether darwin-x64 is still worth shipping.

## Context

- `bun build --compile` has open bugs cross-compiling to macOS (codesign truncation) and across libc variants.
- ndr's release workflow already used a native-runner matrix for the same reason, and its `macos-13` row silently stopped producing a darwin-x64 asset when GitHub retired that label.
- The four platforms cover every machine currently running consumer CI or local installs.

## Why

Cross-compiling from one Linux host is cheaper and simpler, but shipping a truncated or unsigned macOS binary fails exactly at install time on a consumer machine, the most expensive place to find out. Native runners make each binary's build environment match its execution environment, and the smoke test (`--version`, `list-targets`) runs on the real platform before anything is published.

## Alternatives

- **Cross-compile all targets from one Linux runner** — rejected: bun's macOS codesign truncation bug makes the darwin outputs untrustworthy.
- **Ship linux-only and let macOS build from source** — rejected: the primary development machine is darwin-arm64.
