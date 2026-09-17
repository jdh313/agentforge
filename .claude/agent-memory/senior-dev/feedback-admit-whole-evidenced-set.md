---
name: feedback-admit-whole-evidenced-set
description: When admitting runtime keys/fields into agentforge's tables, generalize to the whole documented-and-enforced set rather than the subset a ticket enumerated
metadata:
  type: feedback
---

When a fix admits keys or fields that a target runtime actually enforces, admit the **whole documented-and-enforced set**, not just the subset the dispatch or analysis happened to list. Flag the extension explicitly in the report so it can be rejected cheaply.

**Why:** On Fibery #112 F-2 the dispatch named nine Claude agent frontmatter keys; the evidenced set was twelve (`mcpServers`, `hooks`, `experimental` were equally documented and equally loader-enforced). Stopping at nine would have left the identical defect in place for three keys and scheduled a repeat of the same audit. The team lead confirmed this was the right generalization, not scope creep — the admitting *argument* is what defines the boundary, not the enumeration.

**How to apply:** Once the admitting criterion is stated ("documented AND enforced by the shipped loader"), apply it exhaustively against the evidence artifact. Keys that fail the criterion stay out and get a stated reason — e.g. `observer`/`observerMessage`/`observeSubagents` are loader-read but undocumented, so admitting them would claim a contract nothing backs. Make the extension a labeled, separately-revertible item in the report.

Related: [[feedback-verify-dispatch-against-primary-evidence]], [[project-agentforge-evidence-rule]]
