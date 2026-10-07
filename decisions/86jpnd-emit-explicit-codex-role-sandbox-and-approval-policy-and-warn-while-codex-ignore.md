---
id: "86jpnd"
title: Emit explicit Codex role sandbox and approval policy, and warn while
  Codex ignores it
status: current
decision_date: 2026-10-07
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/schema.ts
  - src/frontmatter.ts
  - src/agent-command.ts
  - src/targets/codex.ts
  - src/codex-agent-bundle.ts
  - src/report.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking task #137"
informed_by:
  - bqyqfd
  - e4edqg
  - mqt5dv
---

# 86jpnd — Emit explicit Codex role sandbox and approval policy, and warn while Codex ignores it

## Decision

Canonical agent keys `sandbox-mode` (read-only, workspace-write, danger-full-access) and `approval-policy` (on-request, never) are translation-only and emitted as written into Codex agent-role TOML as `sandbox_mode` and `approval_policy`. Whenever either is set, the Codex projection raises `codex-role-policy-not-applied`, because codex-cli 0.160.0 runs the spawned child under the parent session's policy regardless of the role.

## Scope

- Binds: leaf Codex agent projection, the Codex agent bundle definition schema, and the compile report's disposition for the new warning.
- Does not bind: the `granular` approval table, `sandbox_workspace_write`, or `permission_profile`, none of which gets a canonical key here.

## Commitments

- The two keys are set only by an explicit author declaration; `tools`, `disallowedTools` and `permissionMode` never produce either field.
- `approval-policy` excludes `untrusted`, which codex-cli 0.160.0 rejects, and `on-failure`, which the Codex configuration reference marks deprecated.
- The warning is raised at compile time on every Codex path that serializes an agent role and maps to the carried-unenforced disposition; installers that copy a compiled role do not re-raise it, and Claude output stays silent.
- `docs/limitations.md` L-014 records the runtime result and is the warning's citation.

## Revisit if

- A codex-cli release records a spawned child's `turn_context` with the role's sandbox or approval values, which retires the warning.
- Codex documents role-scoped policy as intentionally inherit-only, which reopens whether to emit the fields at all.
- An author needs `on-failure`, the `granular` table, or workspace-write tuning.

## Context

- codex-cli 0.160.0 parses `sandbox_mode` and `approval_policy` in a role file, and its `SandboxMode` enum is read-only, workspace-write, danger-full-access.
- In a fresh `codex exec` probe on 2026-10-07, a role declaring `read-only` wrote a file under a `workspace-write` parent, and a role declaring `workspace-write` could not write under a `read-only` parent; each child's `turn_context` recorded the parent's policy, including when the parent's policy came from `config.toml` rather than a CLI flag.
- ndr:bqyqfd already allowed an explicit Codex-native sandbox or approval surface as a separate feature from translating the three Claude policy fields.

## Why

Emitting Codex's own field, exactly as the author wrote it, is the contract the role file format documents, and it takes effect without a recompile the moment Codex applies it. Emitting it silently would let an author believe a role is confined when the runtime gives it the parent's write access, which is the false-enforcement outcome ndr:bqyqfd rejected for translation. The warning keeps the declaration and states, at compile time, that the runtime currently ignores it.

## Alternatives

- **Emit silently and document only** — rejected: a security-relevant setting that has no effect would read as enforced to anyone who does not read the limitations register.
- **Do not ship the keys until Codex honors them** — rejected: discards a working, exact projection of a documented field and leaves authors no way to state the policy.
- **Accept `on-failure` because the binary still loads it** — rejected: the configuration reference deprecates it, and accepting it would commit agentforge to a value Codex is retiring.
