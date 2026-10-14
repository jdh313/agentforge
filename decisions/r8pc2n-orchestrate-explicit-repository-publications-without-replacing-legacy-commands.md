---
id: r8pc2n
title: Orchestrate explicit repository publications without replacing legacy commands
status: current
decision_date: 2026-10-13
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/definitions.ts
  - src/repository-definition.ts
  - src/repository.ts
  - src/cli.ts
  - README.md
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - nt12pb
  - gf2904
  - s1g5yf
  - yxz3mj
---

# Orchestrate explicit repository publications without replacing legacy commands

## Decision

Introduce lowercase `agentforge.yaml`, strict schema `agentforge.repository/v1`,
and additive top-level `agentforge compile/check <config>`. A repository definition
lists explicit config-relative canonical `PACKAGE.yaml` paths and discriminates
marketplace and standalone package publications by `kind`.

## Scope

Repository orchestration only. Existing marketplace/package interfaces and
alternate-definition support retain their contracts. Consumer migration is a
separate pending change, not part of implementing this interface.

## Commitments

- Require a slug ID and a nonempty package universe with no globs, duplicate IDs,
  or alternate package definition filenames. Package sources retain their actual
  canonical definition paths and directories.
- Use existing MarketplaceDefaults for optional repository defaults; require them
  if any marketplace publication exists. Package metadata stays package-owned.
- Marketplace entries retain existing publication fields and require `kind:
  marketplace` and `out`. Package entries have `id`, `kind: package`, `target`,
  `package` (canonical ID), and `out`. IDs are unique across both kinds.
- Each `out` is a required config-relative owned snapshot root. Do not insert an
  implicit publication-ID prefix. No initial `--out` override or report-file option.
- An optional marketplace root manifest owns exactly the native registry at
  config root, re-anchoring local sources into the actual declared output. It
  does not own registry siblings.
- Preserve legacy `MARKETPLACE.yaml` loading, `<out>/<publication-id>` layout,
  and root-manifest behavior; preserve explicit standalone target-suffixed loading.
- Keep Claude/Codex marketplace and Pi standalone capabilities unchanged. Never
  synthesize a Pi marketplace registry, infer new capabilities from config, or
  install packages, execute source, or run package managers during compile/check.
- Keep optional redactions as existing literal strings, not author-supplied regexes.

## Context

One source repository can publish native marketplaces and standalone packages.
The existing marketplace interface cannot express a Pi package without inventing
a registry Pi does not have. An orchestration schema can reuse both compilers
and make output ownership explicit while keeping established consumers stable.

## Alternatives

- Replace MARKETPLACE.yaml or relax its package discovery: rejected because it
  breaks established consumers and changes canonical loading.
- Invent a Pi marketplace: rejected under ndr:nt12pb.
- Reuse a shared CLI output base with implicit ID directories: rejected for this
  interface because every publication already declares its exact owned root.

## Revisit if

A target gains verified native publication capabilities, or explicit consumer
migration requires additional orchestration options. Such migration needs its
own reviewed scope and evidence.
