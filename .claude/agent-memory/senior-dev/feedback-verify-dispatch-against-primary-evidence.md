---
name: feedback-verify-dispatch-against-primary-evidence
description: In agentforge, check a dispatch's factual claims against the cited probe/evidence artifact and report contradictions — paraphrase errors are expected and welcome to surface
metadata:
  type: feedback
---

When a dispatch states a fact and also cites the evidence artifact it came from, **read the artifact and check the claim**. If they disagree, follow the artifact and surface the contradiction explicitly in the report and the reply.

**Why:** On Fibery #112 F-2 the dispatch said Claude Code's *plugin* agent loader ignores-with-a-warning `skills` and `mcpServers`. The extracted loader in `.jj-scratch/probe-claude-agent-frontmatter.md` says the ignored set is `permissionMode`, `hooks`, `mcpServers` — `skills` is not in it. The error was introduced while paraphrasing the probe, not present in the source. The team lead confirmed the correction and explicitly thanked me for checking against the evidence rather than against the dispatcher. An unchecked paraphrase would have propagated into a checked-in `source:` citation, which is exactly the artifact other agents later trust.

**How to apply:** Applies whenever a dispatch, ticket body, or prior report restates something from a probe, binary extraction, or upstream doc. The derived statement is not the evidence. This is the same discipline the repo already enforces on itself — a `source:` string in `src/frontmatter.ts` or a capability-table row must cite what was verified, never what was inferred or remembered. Surfacing the contradiction is the deliverable; silently doing the right thing loses the correction for everyone else.

Related: [[feedback-admit-whole-evidenced-set]], [[project-agentforge-evidence-rule]]
