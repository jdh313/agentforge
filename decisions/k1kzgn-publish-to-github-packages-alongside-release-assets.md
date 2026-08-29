---
id: "k1kzgn"
title: Publish to GitHub Packages alongside release assets
status: current
decision_date: 2026-08-29
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - deployment
  - tooling
binds:
  - .github/workflows/release.yml
  - scripts/publish-npm.mjs
  - npm/**
supersedes: []
superseded_by: []
derived_from:
  - https://github.com/jdh313/agentforge/pull/19
informed_by:
  - 2gj3t6
---

# k1kzgn — Publish to GitHub Packages alongside release assets

## Decision

Consumer repositories take agentforge as a scoped dependency from the GitHub
Packages npm registry: one wrapper package plus one per platform, guarded by
`os`/`cpu`. The release binaries and their `SHA256SUMS` remain published as the
path for consumers without a GitHub token.

## Scope

- Binds: how a consuming repository obtains the compiler.
- Does not bind: what the release workflow builds. The same binaries feed both
  channels.

## Commitments

- Platform packages publish before the wrapper, whose optional dependencies pin
  them exactly, so a failed run leaves inert orphans rather than an entry point
  that resolves to nothing.
- The npm job runs after the release assets are attached, so a tagged release
  never exists without a downloadable binary.
- Each consuming repository needs a one-time Actions access grant on the
  package; this cannot be automated from the workflow.
- Both channels ship every release, and a version present in one must be present
  in the other.

## Revisit if

- The GitHub Packages npm registry permits anonymous installs of public
  packages, which would make the release assets redundant rather than
  complementary.
- Consumers outside this account need dependency-style installation, which the
  token requirement forecloses.

## Context

- Consuming repositories were each hand-rolling a fetch-and-verify layer: a
  pinned version, a per-platform sha256 table, a cache directory, and a
  subcommand to locate the binary.
- Package registries differ in whether a public package can be installed
  anonymously; some require a token regardless of visibility, and some of those
  grant access per-repository rather than automatically.
- A published version on the public npm registry is close to permanent — a
  version string can never be reused, and unpublishing after seventy-two hours
  requires no dependents, low download volume, and a single maintainer.
- Registries operated by a code host generally allow a published package to be
  deleted outright.
- The only current consumers are two repositories in the same account, both of
  which already authenticate to GitHub.

## Why

A package manager already solves version resolution and integrity verification,
so every consumer writing that layer by hand is duplicated work with duplicated
bugs. Choosing GitHub Packages over the public npm registry buys reversibility:
this is a personal tool whose distribution shape is still moving, and a
permanent public commitment is the wrong bet to make early. The token
requirement, which would otherwise be the objection, costs nothing here because
both consumers authenticate anyway — and keeping the release assets means the
requirement never reaches anyone else.

## Alternatives

- **Publish to the public npm registry** — deferred: better ergonomics and the
  unscoped name is available, but the commitment is effectively permanent.
  Reconsider once the distribution shape has settled.
- **Publish only to GitHub Packages, dropping the assets** — rejected: the token
  requirement would make the tool uninstallable for anyone outside the account.
- **Container registry for anonymous pulls** — rejected: a container is a heavy
  way to deliver a command-line binary to a laptop.
- **Keep hand-rolled fetch-and-verify in each consumer** — rejected: this is the
  duplicated work the change exists to remove.
