---
id: "r1h5v3"
title: Release with semantic-release directly from main
status: current
decision_date: 2026-08-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - tooling
  - deployment
  - ci-strategy
binds:
  - .github/workflows/release.yml
  - .releaserc.json
supersedes: []
superseded_by: []
derived_from: []
informed_by: []
---

# r1h5v3 — Release with semantic-release directly from main

## Decision

agentforge releases via semantic-release: every releasable push to `main` (`feat`, `fix`, `perf`, or a breaking change) immediately computes the next version from commits since the last tag, commits `CHANGELOG.md` and `package.json` back with `[skip ci]`, tags `vX.Y.Z`, and publishes the GitHub release. There is no release PR.

## Commitments

- Conventional commit types on `main` are load-bearing: a `feat:` push ships a release; mislabeling a commit mints or withholds a version.
- Each release costs four platform builds and a downstream consumer pin-bump, so unbatched pushes multiply releases.
- The release commit carries `[skip ci]`, so no CI runs on it; `main` must be green before a releasable push.
- Versions and tags are never bumped by hand; semantic-release owns both, seeded by the hand-pushed baseline tag `v0.1.0`.

## Revisit if

- Release frequency makes per-push releases noisy enough that batching (a release-PR model) is worth a repo permission grant.
- The repo gains collaborators who need a human review gate on releases.

## Context

- Consumer repos (ndr, jdh-agents, clearance-driven-dev) pinned agentforge by commit SHA and rebuilt it in CI; moving them to version+checksum pins required tagged releases, which the repo did not have.
- The repo already used conventional commits and had CI but no release tooling.
- release-please's release-PR flow failed at startup: the repo's Actions policy did not allow GitHub Actions to create pull requests, and enabling that is a repo-settings grant.
- ndr (the sibling project) releases with release-please and that repo has the PR-creation grant enabled.

## Why

The deciding factor was the permission surface: semantic-release needs only `contents: write`, which the workflow token already had, while any release-PR flow requires granting Actions the right to open PRs. For a solo repo whose consumers pin explicit versions anyway, the release PR's batching valve was judged not worth that grant or the extra merge step. Divergence from ndr's release-please setup was accepted as the cost.

## Alternatives

- **release-please (release-PR flow)** — rejected: requires the Actions PR-creation grant; the batching it buys matters little for a solo repo.
- **release-please with a PAT** — rejected: a long-lived secret to maintain for the same outcome.
- **tag-on-demand workflow** — rejected: loses CHANGELOG and version automation entirely.
