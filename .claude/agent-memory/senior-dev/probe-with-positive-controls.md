---
name: probe-with-positive-controls
description: For harness-behavior claims in agentforge, plant a defect that must produce an error and check whether it appears; binary strings and minified bundles support absence claims far more weakly than a live load does.
metadata:
  type: feedback
---

When establishing what a harness (Claude Code, codex-cli) actually does, design a **positive control** rather than reading strings: plant something the runtime must complain about, and see whether the complaint appears. Silence then means the code path never ran. Reserve `strings`/bundle greps for locating the mechanism, not for concluding it is absent.

**Why:** On Fibery #112 (2026-09-17) this repeatedly produced conclusions that strings alone got wrong or could not reach.
- Codex has no command listing loaded agent roles, so directory discovery was settled by planting two role files sharing one `name` (and separately one missing `developer_instructions`) in each candidate directory. Both fired in `$CODEX_HOME/agents` and stayed silent in `<repo>/.codex/agents` — establishing that project scope is never scanned, which no string could show.
- A strings-only reading of the same binary had concluded agent roles were a two-layer `AgentRoleToml` + `AgentRoleOverrides` structure. The live load showed a standalone role-file format whose accepted field set is exactly what agentforge emits.
- A dispatched subagent body carrying `NONCE7Q4<<<${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PROJECT_DIR}>>>NONCE7Q4` came back character-for-character unexpanded, proving leaf agents get no substitution. The team lead noted this overturned a binary-strings conclusion that would otherwise have shipped as fact.

**How to apply:** Applies to any capability-table row, `docs/limitations.md` entry, or acceptance claim about a third-party harness. Pick a control whose *positive* case you can also trigger, so silence is interpretable. State in the artifact where the claim stops — Codex agent-role instruction handling is verified at load but not at use, because ndr:L-011 means no probe can watch a role reach a child, and the capability row's `source` says exactly that rather than rounding up. If the auto-mode classifier refuses a probe (it read "echo a root token" as credential access), reword neutrally and note the refusal so it is not mistaken for a null result. Pairs with [[feedback-cite-the-atom-to-push-back]].
