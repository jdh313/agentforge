---
id: "kmjd6p"
title: Keep Codex role registration explicit with a warn-only session check and
  one sync command
status: current
decision_date: 2026-10-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
  - scope
binds:
  - src/codex-installed-plugins.ts
  - src/targets/codex-marketplace.ts
  - src/cli.ts
supersedes: []
superseded_by: []
derived_from:
  - "commit wnwxplsn feat(codex): add sync-codex-agents for installed plugin
    bundles"
  - "commit koppxmov feat(codex): ship a session-start agent role check with
    bundle packages"
  - "commit nnynnnzs fix(codex): harden sync-codex-agents discovery and the
    agent role check hook"
informed_by:
  - c4f52m
  - pz1x3e
  - zc7b6k
---

# kmjd6p — Keep Codex role registration explicit with a warn-only session check and one sync command

## Decision

Codex agent role registration stays an explicit user action. A bundle package ships a generated `SessionStart` hook that only checks and warns, and a single `sync-codex-agents` command performs every installed plugin's registration or update in one run.

## Scope

- Binds: Codex marketplace packages compiled with `codex-agent-bundle: true`, and the `sync-codex-agents` command.
- Does not bind: the per-bundle lifecycle commands, Claude projection, or removal of roles after a plugin is uninstalled.

## Commitments

- The generated hook never writes, always exits 0, and stays silent when any checked scope is current.
- The hook reports through the `systemMessage` JSON field so the warning reaches the user rather than only the model's context.
- `sync-codex-agents` reuses the per-bundle check, install, and lifecycle-update paths and adds no lifecycle semantics of its own.
- Sync discovers plugins only from enabled entries in the user Codex configuration and their cached directories, and refuses per plugin rather than failing the run.
- A package that ships the hook carries it in its own hook file beside any authored hooks.

## Revisit if

- Codex lets a plugin package register agent roles natively.
- Codex adds a plugin install or update lifecycle event.
- Users routinely find the warning insufficient and ask for registration on session start.

## Context

- Codex plugin packages cannot register agent roles, so each bundle needed a separate per-plugin setup step after installing the plugin.
- Codex has no plugin install event; `SessionStart` is the earliest hook that runs after a plugin is installed.
- Registration writes the user's Codex configuration and role files, which may live in a version-controlled dotfiles repository.
- Codex surfaces plain `SessionStart` stdout only as model developer context; the `systemMessage` field is shown as a UI warning.
- Several bundle packages starting at once would contend for one scope lifecycle lock that refuses rather than waits.

## Why

Writing configuration on every session start would mutate a user's dotfiles unprompted and race multiple plugins against one lock, while the explicit setup policy already chose deliberate registration. A read-only warning keeps that boundary and still removes the failure mode of forgetting, and one sync command removes the per-plugin repetition that motivated the change. Reusing the per-bundle paths keeps ownership, receipts, and refusals identical whichever entry point the user takes.

## Alternatives

- **Register automatically from the session hook** — rejected: unprompted writes to user configuration, lock contention across plugins, and a reversal of the explicit setup policy.
- **A warning hook without a sync command** — rejected: it reminds the user but leaves one setup action per plugin.
- **Sync from a compiled marketplace directory** — rejected: it registers the source build, which can differ from the version Codex actually runs.
