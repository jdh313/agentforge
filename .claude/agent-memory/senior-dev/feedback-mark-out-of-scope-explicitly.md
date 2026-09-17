---
name: feedback-mark-out-of-scope-explicitly
description: In a handoff report, list regions you deliberately did NOT change and say why, so a later reader cannot re-derive them as missing work
metadata:
  type: feedback
---

When a report names follow-up work, explicitly list the adjacent code regions that are **finished** or **deliberately excluded**, with file:line and the reason — not just the regions that need work.

**Why:** On agentforge Fibery #32, the report originally sized a follow-up across four diagnostic codes. Two of them turned out to be already correct by a checked-in convention. Marking `src/render.ts:188-231` as "NOT in scope — already correct; listed here only so a later reader does not re-derive it as missing work" was singled out by team-lead as "the part most people skip", and it shrank the follow-up from 4 codes / 60-80 lines to 2 codes / 35-45 lines. A gap list without an exclusion list invites the next agent to redo settled work.

**How to apply:** In any report with a "risks and follow-up" section, every sibling region a reader would naturally scan next gets one line: either it is in scope, or it is finished and here is why. Applies to handoff reports, ticket bodies, and PR descriptions. Pairs with [[feedback-check-proposal-against-own-rule]] — the exclusion is often a convention the change itself emits.
