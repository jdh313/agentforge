# Codex agent `skills`: follow-ups the verification surfaced

Verifying canonical `skills:` against Codex (L-013 in
[limitations.md](limitations.md)) turned up three things that are wrong or stale
elsewhere in the repo. None blocks L-013, and none was fixed in the change that
found it, because each belongs to a different row, entry, or task. This page
holds them so they are not rediscovered.

Found 2026-09-21 against codex-cli 0.154.0. Upstream source is openai/codex tag
`rust-v0.154.0`, commit `6b9826e3aa83b1a5947db50f4332cb9c65f1b340`; paths below
are relative to its `codex-rs/`.

## 1. L-011 conflicts with L-013's evidence

L-011 says no spawned child ever applies a custom agent role, and infers that
the spawn tool has no role-selection parameter. L-013's live runs, on the same
codex-cli version five days later, applied roles to spawned children: the
parent's prompt named each role as `spawn_agent`'s `agent_type`, an unknown name
failed with `unknown agent_type`, and each child's rollout named its role and
showed the role's effect on its skills catalog. Source agrees with the runs:
`core/src/tools/handlers/multi_agents_spec.rs` exposes `agent_type` on the spawn
tool, and `core/src/agent/role.rs` defaults it to the role named `default` when a
caller omits it.

The likely reading is that L-011's "never applies" is a property of prompts that
did not pass `agent_type`, not of the product. That is a hypothesis: neither
entry ran a probe that varies only that one input.

- **What is unchanged:** L-013 states the tension and leaves L-011 as written.
- **Action:** retest L-011 with `agent_type` passed explicitly and roles in
  `$CODEX_HOME/agents`, then amend L-011 in place under its own ID, leading with
  a dated note on what the earlier framing got wrong (the register's rule for a
  scoped-too-narrowly entry). The Fibery task that retests L-010 and L-011 is
  the natural owner.
- **Cost of leaving it:** the field-parity `agent` row on the Skill table cites
  L-011 as "0.154.0 never applies a custom role to a spawned child", so a wrong
  L-011 makes that row wrong too.

## 2. "Eight override fields" is nine, and `sandbox_mode` is not one of them

`docs/field-parity.md` (intro to the Agent section, and the sentence at "Half of
Codex's eight agent-role ..."), `src/capabilities.ts` (the `AgentRoleOverrides`
field-set citation), and a comment in `src/frontmatter.ts` all say the Codex
agent-role override set is exactly eight fields. At the pinned commit
`AgentRoleOverrides` (`core/src/agent/role.rs`) has nine: the eight listed, plus
`features`, a map that a role can only use to switch off six named features
(shell tool, apps, personality, plugins, memory tool, request-permissions tool).

The same text places `sandbox_mode` "on the same struct". It is not on
`AgentRoleOverrides`. A role file is a flattened `ConfigToml`, so `sandbox_mode`
can be written in one, but whether a role's value reaches the spawned child is
not established by anything in this repo.

- **Why it matters:** the `tools`, `disallowedTools`, and `permissionMode` rows
  are all `Blocked -> sandbox_mode` on the strength of that placement. If a
  role's `sandbox_mode` is never applied, those rows are closer to No analogue.
- **Action:** correct the count and the struct claim in the three files when
  field-parity is next refreshed. Probe whether a role's `sandbox_mode` reaches
  the child before the task that decides the `sandbox_mode` mapping relies on it.
- **Not changed by L-013:** its edit reworded the sentence but kept the count,
  because the count is shared with rows it did not own.

## 3. Stale `skills` wording in the field-parity skill and the published map

- `.claude/skills/field-parity/SKILL.md` calls `skills` on the Codex agent role
  "a name that matches and a meaning that is unestablished". It is established
  now (L-013): the meaning is subtractive-only, so the worked example should say
  the name matches and the meaning differs.
- The same passage cites `ndr:d17fnt` for "a row moves to Native or Translated
  only on verified semantics". That atom is about resolving an artifact's install
  destination, and does not carry the claim. Resolve the right atom (or drop the
  cite) before the next edit; do not trust a ticket's or skill's `ndr:` ref
  without resolving it.
- The published routing-map artifact still shows the old Blocked row for
  `skills`. It is a dated snapshot. Republishing it is outward-facing, so it is
  a decision for the repo owner, not a doc edit.
