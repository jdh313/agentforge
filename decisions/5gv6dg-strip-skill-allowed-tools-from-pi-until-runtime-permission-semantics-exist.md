---
id: "5gv6dg"
title: Strip skill allowed-tools from Pi until runtime permission semantics exist
status: current
decision_date: 2026-10-12
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
binds:
  - src/frontmatter.ts
  - src/capabilities.ts
  - src/targets/pi.ts
  - src/render.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - nt12pb
---

# Strip skill allowed-tools from Pi until runtime permission semantics exist

## Decision

Do not emit allowed-tools in Pi skill frontmatter. Report its removal through the existing claude-only-frontmatter-stripped diagnostic (a legacy name), including when the field appears only in a Pi override. Preserve Claude output and the canonical schema's string/array representations.

## Context

Installed Pi 1.1.0 dist/core/skills.js loadSkillFromFile returns name, description, source information and disableModelInvocation, but does not apply allowed-tools. The skills documentation lists the field as experimental under the Agent Skills specification; this does not establish native pre-approval or command-filter enforcement. Source inspected 2026-10-12.

## Commitments

- Mark the Pi skill capability unsupported and remove Pi from the frontmatter retention membership; do not add a serialization workaround that implies an operational permission policy.
- Use the same projection for leaf renders/installations and standalone packages. Explicit target overrides cannot silently reinstate unsupported keys.
- Native extension tool-call guards remain independent code with their own scope and runtime evidence. A destructive-command guard is not equivalent to the skill's tool policy.
- Leave Pi agent-extension tool configuration unchanged; it is a separate surface with distinct native semantics.

## Revisit if

A pinned Pi runtime applies skill-level tool policy with verified permission and command-filter semantics.

## Alternatives

- Join canonical arrays into strings: fixes serialization but preserves misleading operational metadata.
- Map Claude tool names/filters to Pi tool names automatically: loses command-filter semantics without establishing enforcement.
- Require every plugin to override its allowed-tools representation: distributes a runtime capability problem across consumers without solving it.
