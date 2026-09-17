---
name: feedback-capability-citation-is-the-deliverable
description: In agentforge, adding a missing primary-source citation to a capability-table row is high-value work, not a footnote — lead with it rather than burying it under code changes
metadata:
  type: feedback
---

When a pass turns up a primary source the repo has never cited, **adding it to the relevant `src/capabilities.ts` row is the headline deliverable**, not an incidental cleanup. Lead with it in the report and the reply.

**Why:** On Fibery #114 I found Codex's published hooks reference and listed the citation bump third, framed as a footnote under two code changes. The team lead reordered it: *"this is the one I want most and you framed it as a footnote."* The table's contract is one doc citation per row (ndr:g6xvyk), and the `codex/hook` row had been resting on binary-strings evidence alone — so the row was silently failing its own contract. A capability row is the artifact other agents trust later; an uncited row is a latent defect even while every value in it happens to be right.

**How to apply:** Applies whenever research surfaces a vendor doc, a changelog, or a spec that the capability table, `src/frontmatter.ts`, or a `docs/*-parity.md` file does not already cite. Add the doc **beside** existing binary or probe evidence, never replacing it — the binary verifies what exists, the doc verifies what a field means, and a row that drops one loses an independent check. Fold in what the doc establishes beyond the immediate question, including its **negatives**: on #114 the useful fact was that Codex defines exit 0 and exit 2 and gives *no* meaning to exit 1 or a crash, which is what killed a proposal to add a fail-open/fail-closed declaration agentforge could never check.

Related: [[feedback-hunt-vendor-doc-before-unestablished]], [[feedback-verify-dispatch-against-primary-evidence]]
