---
id: "az33k6"
title: Project Pi agents to the pi-subagents extension at a pinned version
status: current
decision_date: 2026-10-08
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/targets/pi.ts
  - src/frontmatter.ts
  - docs/field-parity.md
  - docs/limitations.md
supersedes: []
superseded_by: []
derived_from:
  - "Fibery Project Tracking/Task #138 (Pi agents: decide to target
    @gotgenes/pi-subagents and its field mapping)"
  - "Fibery Project Tracking/Task #118 (Post-1.0: verified agent support for
    OpenCode, Pi, and future runtimes)"
informed_by:
  - 2pmgn1
  - bqyqfd
  - 728mf7
  - e0w650
  - 4x4yyv
---

# az33k6 — Project Pi agents to the pi-subagents extension at a pinned version

## Decision

The Pi target projects canonical agents to the agent file format of the third-party `@gotgenes/pi-subagents` extension, pinned at 23.2.0: one `<name>.md` per agent in `~/.pi/agent/agents` (user) or `.pi/agents` (project), body as the agent prompt, with every canonical key assigned either a Pi form or a named loss.

## Scope

- Binds: leaf agent projection and installation for target `pi`.
- Does not bind: Pi-only keys with no canonical source (`display_name`, `prompt_mode`, `inherit_context`, `enabled`, `locked`); they are not emitted until a need names them.
- Does not bind: what happens to a lost tool restriction, which a separate decision governs.

## Commitments

- `name` becomes the filename stem and is not emitted as a key; `description` is retained as-is.
- `effort` is emitted as `thinking` with identical values.
- `maxTurns` is emitted as `max_turns` verbatim; a value of 1 is reported, because the extension runs it as 2.
- `background` is emitted as `run_in_background`, normalized to a YAML boolean, because the extension ignores string booleans.
- `model` is emitted only from `targets.pi.model`, and `tools` only from `targets.pi.tools`; a shared value of either is reported as stripped. No Claude-to-Pi tool-name or model-alias map lives in shared code.
- `disallowedTools`, `permissionMode`, `isolation`, `memory`, `omitClaudeMd`, `skills`, `initialPrompt`, `color`, `mcpServers`, `hooks`, `experimental`, and the Codex-only `reasoning-summary`, `verbosity`, `sandbox-mode` and `approval-policy` are reported as keys Pi does not accept.
- The pinned extension version is one checked-in constant, cited in `docs/field-parity.md` and `docs/limitations.md`.
- Without the extension, AgentForge reports nothing: it cannot observe the runtime, and the installed files are inert.

## Revisit if

- Core Pi gains a native registered-agent surface.
- A new extension major changes the loader's key set, naming, or discovery paths.
- Runtime verification (#141) contradicts the code-read key list.
- Canonical agent frontmatter gains a vendor-neutral model or tool vocabulary.

## Context

- Core Pi 1.0.2 reads no agent files; its README states it skips sub-agents, and its only agent loader is an example extension that is not loaded by default.
- `@gotgenes/pi-subagents` 23.2.0 reads Markdown agents from `~/.pi/agent/agents/*.md` and `<cwd>/.pi/agents/*.md` (project wins, no subdirectories), taking the agent name from the filename.
- Its loader reads exactly eleven keys (`description`, `display_name`, `tools`, `model`, `thinking`, `max_turns`, `prompt_mode`, `inherit_context`, `run_in_background`, `enabled`, `locked`) and ignores every other key without warning.
- Its `tools` is an exact-match allowlist of Pi-native lowercase names; a Claude name such as `Read` matches nothing, and an omitted `tools` grants all seven built-ins.
- Its `model` fuzzy-matches against every authenticated provider and silently inherits the parent model on a miss.
- It has no denylist, permission, or mode concept; tool permission policy lives in a separate package.
- Pi has no CLI that loads or validates an agent file.
- #118 had said to keep Pi agents unsupported if core Pi lacked an agent surface; the user chose on 2026-10-08 to target this extension instead.

## Why

Targeting the extension is the only way Pi agents exist at all, and the user accepted the dependency on a third party in exchange. Pinning a version makes that dependency explicit: the mapping is a claim about one loader's code, and a later major can change it silently since the loader warns on nothing. The mapping keeps a key only where the two meanings line up and the value vocabulary is shared, which is why `effort`, `maxTurns` and `background` translate. `model` and `tools` carry vendor vocabularies, and the extension resolves both silently on mismatch: a Claude alias can bind to another provider's model, and a Claude tool name yields an agent with no tools. Taking both from the Pi override follows 2pmgn1's reasoning, which favors an omission that is reported over a value that looks right on disk and fails at runtime. Every remaining key has no reader in the extension, so naming it as a loss is the only honest outcome.

## Alternatives

- **Keep Pi agents unsupported** — rejected: the user chose to target the extension once core Pi was confirmed to have no agent surface.
- **Track the extension's latest version** — rejected: the loader ignores unknown keys silently, so drift would not surface as an error anywhere.
- **Pass shared `model` and `tools` through** — rejected: the extension's silent fuzzy-match and exact-match resolution turn Claude vocabulary into wrong or empty behavior.
- **Translate tool names through a checked-in map** — rejected: puts a vendor tool dialect into shared code, the same objection 2pmgn1 raises against a model alias map.
