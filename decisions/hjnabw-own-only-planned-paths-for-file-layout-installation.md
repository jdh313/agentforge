---
id: "hjnabw"
title: Own only planned paths for file-layout installation
status: current
decision_date: 2026-09-15
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/install.ts
  - src/materializer.ts
  - src/check.ts
  - src/targets/claude.ts
  - src/targets/codex.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking/Task #111 (AgentForge 0.8: canonical agent schema
    and target adapters)"
informed_by:
  - 2t36rb
---

# hjnabw — Own only planned paths for file-layout installation

## Decision

A file-layout artifact installation owns and replaces only the regular-file paths in its compilation plan inside the target's shared install directory. Directory-layout artifact installation continues to own and replace its dedicated artifact directory as a complete snapshot.

## Scope

- Binds: leaf `install` and `check-install` ownership for file-layout artifacts.
- Does not bind: marketplace publication, uninstall, or package-native registration.

## Commitments

- Installing a file-layout artifact never swaps, scans as owned, or prunes the containing directory.
- An explicit install may replace a regular file at the identity-derived planned path, but refuses a symlink, directory, or other irregular entry there.
- Installed-state checks inspect only planned paths and ignore unrelated siblings.
- Renaming an artifact leaves the old path untouched; removal requires a future explicit ownership record or uninstall operation.
- Directory-layout installation keeps complete-snapshot replacement and unexpected-file detection inside its dedicated artifact directory.

## Revisit if

- File-layout artifacts need coordinated multi-file publication that cannot be made failure-atomic per planned path.
- AgentForge adds an ownership manifest or uninstall operation that can prove which stale paths it may remove.
- A target requires one registry document containing several canonical agents rather than one identity-derived file per agent.

## Context

- Canonical agents have file layout and project to one identity-derived `.md` or `.toml` file.
- Claude and Codex discover project agents in shared directories that can contain independently managed sibling agents.
- The existing materializer replaces an entire destination root as a complete snapshot.
- The existing snapshot checker reports every unplanned file under its root as unexpected.
- Agent installation is disabled because applying those directory-owned semantics to a shared agents directory would delete siblings.

## Why

The artifact layout already identifies the smallest safe ownership boundary. A directory-layout skill receives a dedicated directory, so complete-snapshot replacement provides deterministic stale cleanup without affecting another artifact. A file-layout agent shares its parent directory with unrelated agents, so the only boundary justified by the explicit install request is the identity-derived path present in the plan.

Allowing replacement of a regular file at that exact path preserves ordinary update behavior and matches the existing install command's explicit intent. Refusing irregular entries prevents following symlinks or recursively replacing directories. Ignoring siblings during checks keeps verification aligned with the same ownership boundary instead of turning coexistence into drift.

Without a persistent ownership record, an old path after a rename cannot be distinguished from a separately managed sibling. Leaving it in place is the conservative consequence; silent stale cleanup would claim authority the plan does not establish.

## Alternatives

- **Replace the shared agents directory as a snapshot** — rejected: installing one agent would delete unrelated sibling agents.
- **Refuse every existing same-name file without an ownership manifest** — rejected: it makes normal updates impossible even though the user explicitly selected the source, target, scope, and identity-derived destination.
- **Add an ownership manifest now** — deferred: it expands this slice into lifecycle tracking and uninstall semantics that are unnecessary for safe single-artifact updates.
- **Infer and delete stale names from source history** — rejected: no current plan proves that an old sibling belongs to this artifact.
