---
name: feedback-check-proposal-against-own-rule
description: Before proposing follow-up work, check it against the rules the current change itself states in comments or types
metadata:
  type: feedback
---

Before sizing or proposing follow-up work, re-read the rules the change just landed states — in its own type comments, docstrings, or invariants — and check the proposal does not contradict one.

**Why:** On agentforge Fibery #32 I wrote `SourceLocation.line` with the comment "Absent when the construct is identified by a key rather than a position — a frontmatter key has no line that identifies it" (`src/compiler.ts:115-116`), which restates the standing convention at `src/compatibility.ts:25-26`. I then sized a follow-up to go recover exactly those frontmatter key lines. A teammate caught it; I had stated the rule at both ends and proposed work against it. The failure is invisible to ordinary review because the proposal looks like ordinary gap-filling.

**How to apply:** After drafting a "remaining gaps" list, grep the diff's own comments for rules about the same construct. If a gap contradicts one, the gap is not a gap — it is the finished state. If the convention genuinely is wrong, supersede the decision that states it rather than routing around it silently (team-lead was explicit that the door exists but is not an invitation). Related: [[feedback-mark-out-of-scope-explicitly]], [[feedback-cite-the-atom-to-push-back]].
