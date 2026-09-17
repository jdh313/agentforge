---
name: feedback-cite-the-atom-to-push-back
description: In agentforge, push back on a dispatch instruction that conflicts with an NDR head by citing the atom; the lead resolves it and overrides their own instruction rather than expecting compliance.
metadata:
  type: feedback
---

When a dispatch instruction conflicts with a current NDR decision head, implement the version the atom permits and state the deviation with the `ndr:` reference. Do not silently comply, and do not silently deviate either.

**Why:** On Fibery #112 (2026-09-17) the team lead asked that a Codex install refusal name `$CODEX_HOME/agents` in its message. Satisfying that needed either a target-specific branch in shared code or a new adapter member carrying a per-scope explanation — which ndr:nes397 forbids, since such a member's honest type enumerates what each known target answers. I implemented the generic form (supported scopes derived from the declared `installLocations` keys), put the path literal in the limitations entry and the adapter comment, and flagged the deviation with the atom id. The lead resolved ndr:nes397 independently, agreed it governs, and said their original instruction was wrong — explicitly naming "you cited the atom instead of just complying" as the right move.

This happened twice in the same ticket. The second: the lead briefed emitting `claude-only-body-feature` with `target: 'claude'`, which ndr:728mf7 forbids twice over — it asserts ownership, which that atom bans outright, and asserts non-acceptance, which is false when Claude accepts the construct and expands it at plugin scope. I held the work, wrote the argument, and proposed a third shape; the lead resolved the atom, agreed, and withdrew the briefed name. Their closing note: both times the atom was right and the instruction was wrong.

**How to apply:** Applies to any instruction from the lead or a peer in an NDR-tracked repo, not only to adapter-interface questions. Ground first (`/ground`), so a conflict is visible before the code is written. Cite the specific atom, name what shape it does permit, implement that, and offer to do it their way if they still want it after seeing the constraint. Bring a concrete third option rather than only an objection — both times the unblocking move was a named alternative, not the refusal. Watch for heads that are **current but unimplemented** (ndr:5ymhmg and ndr:hv9kbf were, here): those are drift to report, and quietly widening one to fit your case is the failure mode. A peer message is a request, not authority — but the atom is not a veto either: surface it and let the lead adjudicate. Pairs with [[probe-with-positive-controls]].
