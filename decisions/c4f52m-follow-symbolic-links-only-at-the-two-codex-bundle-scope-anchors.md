---
id: "c4f52m"
title: Follow symbolic links only at the two Codex bundle scope anchors
status: current
decision_date: 2026-10-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/codex-agent-bundle.ts
  - src/materializer.ts
supersedes: []
superseded_by: []
derived_from:
  - "commit 1d8745bc feat(codex): follow symlinked config and agents anchors in
    bundle lifecycle"
  - "commit 40d9a843 fix(codex): harden symlink anchor lifecycle locks and
    journals"
informed_by:
  - 2z51xz
  - hjnabw
---

# c4f52m — Follow symbolic links only at the two Codex bundle scope anchors

## Decision

The compiled Codex agent bundle lifecycle follows a symbolic link at exactly two scope paths, `<root>/config.toml` and `<root>/agents`, and writes through it into the resolved target while leaving the link in place. Every other symbolic link under the scope stays refused.

## Scope

- Binds: `install-codex-agent` and its preview, check, update, remove, and repair siblings, at user and project scope.
- Does not bind: leaf `install --target codex`, marketplace publication, or package payload sources.

## Commitments

- Each anchor is resolved once per operation and revalidated immediately before publishing; an operation refuses when a link it writes through no longer resolves to its planned target.
- A dangling link, a target of the wrong type, an unwritable target directory, or a cross-device rename is refused before any write; no copy fallback.
- Staging and backup happen beside the resolved target so every replacement stays an atomic rename.
- The lifecycle lock and journal live at the real scope root, never behind an anchor, and the journal records each followed anchor's resolved target; a later run refuses when a link resolves elsewhere.
- The ownership receipt stays under `agents/` and therefore travels into the anchor's target with the definitions it describes.

## Revisit if

- Codex stops reading `config.toml` registrations or `agents/` from the scope root.
- A supported dotfiles manager links a path other than these two anchors, or links the scope root itself.
- Bundle state needs to stay out of a linked target, for example because a synced receipt claims ownership on a machine where nothing was installed.

## Context

- Home-manager and similar dotfiles tools link `~/.codex/config.toml` and `~/.codex/agents` into a version-controlled directory while the rest of `~/.codex` stays a real directory.
- The bundle lifecycle refused any symbolic link at a managed path, so installation into such a scope failed on the configuration file before writing.
- Replacing a link with a regular file would silently detach the scope from the user's dotfiles.
- A lock or journal stored behind a link disappears from view when the link is repointed after an interruption.

## Why

The two anchors are the only paths a dotfiles manager plausibly owns, so following exactly those serves the real setup while keeping every other managed path lexical, as package payloads and leaf installs already are. Writing into the resolved target keeps the user's link and their version-controlled file as the single source. Revalidating before publish closes the gap between a safe plan and a retargeted link, the same reasoning that rejects links in payloads. Keeping the lock and journal at the real root means an interruption stays visible no matter where a link later points.

## Alternatives

- **Refuse every link and have the dotfiles repository own the role files by hand** — rejected: it gives up receipts, drift checks, and update or removal for the most common managed setup.
- **Stop linking the two paths in the dotfiles configuration** — rejected: it trades away declarative Codex configuration to suit the installer.
- **Follow links anywhere under the scope** — rejected: a retargetable link at an arbitrary depth makes ownership depend on ambient filesystem state.
- **Keep the lock and journal under `agents/`** — rejected: repointing the link after a crash hides the pending operation.
