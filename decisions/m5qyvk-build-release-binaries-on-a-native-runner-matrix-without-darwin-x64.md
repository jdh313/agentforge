---
id: "m5qyvk"
title: Build release binaries on a native-runner matrix without darwin-x64
status: current
decision_date: 2026-08-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - ci-strategy
  - deployment
binds:
  - .github/workflows/release.yml
supersedes:
  - 2cgwmm
superseded_by: []
derived_from: []
informed_by: []
---

# m5qyvk — Build release binaries on a native-runner matrix without darwin-x64

## Decision

Release binaries are compiled with `bun build --compile` on one native GitHub runner per shipped platform — linux-x64, linux-arm64 (`ubuntu-24.04-arm`), and darwin-arm64 — rather than cross-compiled from a single host. Intel macOS is not a shipped platform.

## Commitments

- Three runner jobs per release, including macOS minutes.
- macOS builds set `BUN_NO_CODESIGN_MACHO_BINARY=1` and ad-hoc `codesign` explicitly (oven-sh/bun#29120 workaround); dropping either yields broken binaries.
- An Intel-Mac consumer has no binary and must build from source with bun.

## Revisit if

- bun's cross-compilation to macOS and cross-libc targets becomes reliable, collapsing the matrix to one runner.
- An Intel macOS consumer actually appears before GitHub retires x64 macOS runners entirely (Fall 2027).

## Context

- `bun build --compile` has open bugs cross-compiling to macOS (codesign truncation) and across libc variants.
- No current consumer CI or local install runs Intel macOS; the development machine is darwin-arm64 and consumer CI is linux-x64.
- GitHub retired `macos-13` in Dec 2025 and announced `macos-15-intel`, the last x64 macOS label, retires Fall 2027 — ndr's release had already silently shipped without its darwin-x64 asset when the label went away.

## Why

Native runners stay: a truncated or unsigned macOS binary fails at install time on a consumer machine, the most expensive place to find out, and the per-platform smoke test runs on the real platform before publishing. darwin-x64 drops out because it served no actual consumer while being the one row on borrowed time — a label GitHub is retiring — so keeping it bought maintenance risk, four-way build minutes, and a false claim of support.

## Alternatives

- **Keep darwin-x64 on `macos-15-intel`** — rejected: serves no known consumer and the label retires Fall 2027 regardless.
- **Cross-compile all targets from one Linux runner** — rejected: bun's macOS codesign truncation bug makes darwin outputs untrustworthy.
