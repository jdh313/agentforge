# Limitations register

What AgentForge cannot represent, cannot translate, or translates in a way a
consumer has to know about. One entry per **gap**, not per plugin.

## Why this doc exists

Before this file, that knowledge lived in four places and was indexed by plugin
or by decision, never by gap: the per-plugin disposition tables in
cc-marketplace's `docs/agentforge-compatibility.md`, NDR atoms in both ledgers,
Linear tickets, and the vault. None of those answers "what does the compiler
not handle?" — they answer "what happened to this plugin?" and "why did we
decide this?".

The cost is measured, not hypothetical. A drafting session on 2026-08-02
rediscovered the `disallowed-tools` gap (L-001) from scratch, then noticed that
`craft` and `librarian` already shipped with the same condition. Nobody had
collected it, so it had to be found twice.

This is the collecting place. It is about **the compiler**: what the schema,
the capability table, and the construct detector can and cannot see.

**Not in scope here:**

- Per-plugin dispositions — which plugin ships what, and what each one loses on
  each target. That is the consumer-side view and it lives in
  cc-marketplace `docs/agentforge-compatibility.md`. Reference it; do not
  duplicate it.
- Decision rationale. That is the NDR ledger. Cite atoms as `ndr:<id>`.
- Roadmap items. "Not built yet" is a milestone, not a limitation. See
  `CLAUDE.md` § Out of scope today.

## How to add an entry

Append a new `## L-NNN` section at the end, using the next free number. Never
renumber or reuse an ID — tickets, atoms, and commit messages cite them. Keep
every field, in this order:

| Field | What goes in it |
| --- | --- |
| **Gap** | What the compiler cannot represent or see. One or two sentences, stated as a property of the compiler. |
| **Manifests as** | What a user or tester actually observes. Not the mechanism — the symptom. |
| **Affects** | Which plugins, targets, or surfaces are hit *today*. Name them. "Potentially anything" is not an answer. |
| **Evidence** | How we know, and when it was checked. Empirical probes beat doc citations; doc citations beat reasoning. Always carry a verification date. |
| **Status** | `open` / `by-design` / `fixed-in <sha>`. A `by-design` entry still belongs here if a tester has to know it. |
| **Where to look** | File and symbol pointers into `src/`. |

When an entry's status changes, edit it in place and add a dated line to
**Evidence**. Do not delete fixed entries: a register whose fixed rows are
pruned cannot tell you whether something was ever a problem.

When new evidence shows an entry was **scoped too narrowly** — wrong targets,
wrong severity, wrong blast radius — amend it in place under the same ID rather
than filing a second one. Two IDs for one gap is how a register starts lying
about how many gaps it has. Lead the amended entry with a dated note saying what
the earlier framing got wrong, so a reader who cited the old version can tell
whether their citation still holds.

---

## L-001 — `disallowed-tools` is destroyed at parse, on every target including Claude

> Escalated 2026-08-03. This entry was first written as a Codex-scoped
> visibility gap. Both halves of that framing were wrong: the key is destroyed
> in the **Claude** projection too, for a runtime that supports it, and the
> defect is already **published**. Widened rather than superseded — same ID.

**Gap.** A Claude skill may carry a `disallowed-tools:` frontmatter key.
`CanonicalSkillFrontmatter` is a **closed** `z.object` enumerating `name`,
`description`, and thirteen Claude-only keys; `disallowed-tools` is not among
them, so zod strips it at parse — before any target adapter runs, and before
the construct detector sees the artifact. Everything downstream follows from
that single fact:

- No warning. The key is absent from `CLAUDE_ONLY_KEYS`, so
  `claude-only-frontmatter-stripped` never names it — and could not, since the
  value is already gone.
- No declarable loss. It is absent from `CLAUDE_ONLY_CONSTRUCTS`, so
  `losses: [{construct: disallowed-tools}]` fails schema validation. A package
  cannot write the loss down even deliberately.
- **No Claude output.** This is not a target-capability gap. Claude *supports*
  `disallowed-tools`. The key is destroyed in the projection for a runtime that
  can honor it.

**Manifests as.** A skill that forbids a tool in canonical source permits it in
every projection, including the Claude one. Nothing errors, nothing warns,
nothing appears in the compatibility report. A reviewer reading canonical source
sees the constraint; a reviewer reading compiled output has no way to tell it
ever existed; and the runtime that installs the compiled output enforces
nothing.

**Affects.** Every target, including `claude`. `compass`, `craft`, `librarian`.

Load-bearing for `compass`. Its `reflect` and `mull` skills enforce a
never-web-search, never-delegate stance *only* through `disallowed-tools`.
Stripped, the stance separation that justifies keeping three separate skills
does not hold — the skills reduce to near-identical bodies with none of the
boundary that made them distinct.

**Evidence.** Established 2026-08-02 during a drafting session. Escalated
2026-08-03 on four findings:

1. **The Claude projection drops it.** Canonical source at
   `plugins/compass/skills/reflect/SKILL.md` carries `disallowed-tools` with
   `WebSearch`, `WebFetch`, and `Agent`. The compiled `claude/` projection of
   that same file does not.
2. **It is already published.**
   `~/.claude/plugins/marketplaces/jdh/plugins/compass/skills/reflect/SKILL.md`
   — the `jdh313/shared-claude-plugins` mirror that any other machine installs
   from — has no `disallowed-tools`. `reflect` and `mull`, whose entire stance
   is never-web-search and never-delegate, **ship today in a form where nothing
   prevents either**. This is a live correctness defect in published output, not
   a latent gap.
3. **Local Claude does not show it** because the cc-marketplace Claude
   marketplace is registered as a Directory pointed at the repo, so it reads
   canonical source, where the key survives. This is the same accident as L-006:
   a wrong-path install preserving what the right-path projection destroys.
4. **Leaf-renderer probe.** A probe skill carrying
   `disallowed-tools: WebSearch, Task` rendered to both `claude` and `codex`
   produced output frontmatter of `name` + `description` only, zero warnings on
   either target.

Commands and agents are the lone exception, and only by accident: they are
emitted as verbatim source bytes on the Claude marketplace path
(`claude-marketplace.ts:109`), so the key rides along unexamined. Nothing in
the compiler's model knows it exists there either.

**Status.** open — and the most severe entry in this register. Every other
entry describes something a consumer must *know*; this one describes published
artifacts that do not do what they say.

**Where to look.** `src/schema.ts` — `CanonicalSkillFrontmatter` (the closed
`z.object`) and `CLAUDE_ONLY_KEYS`. `src/definitions.ts` —
`CLAUDE_ONLY_CONSTRUCTS`, `DeclaredLoss`. `src/render.ts:140` — the
stripped-keys warning that cannot fire. `src/agent-command.ts` —
`CommandFrontmatter`, a `looseObject`, so the key lands in `sourceFrontmatter`,
which nothing consumes.

**The asymmetry is the bug.** `ndr:17dhph` deliberately validates generated
native documents with `z.looseObject` *specifically* to retain unrecognized
keys — see the loose schemas throughout `src/targets/codex-marketplace.ts` and
`src/targets/claude-marketplace.ts`. The output side is open by decision. The
input side is closed by default. Canonical frontmatter is the one place in the
pipeline where an unrecognized key is silently discarded rather than carried,
and it is the one place where the author's intent enters.

---

## L-002 — A skill's own `allowed-tools` is a warning, not a gated loss

**Gap.** The same tool allowlist is treated with two different severities
depending on which artifact carries it. On a **command**, `allowed-tools:`
detects as the `command-tools-filter` construct, which the undeclared-loss gate
blocks: the compile fails until the package declares it. On a **skill**,
`allowed-tools:` is merely a Claude-only frontmatter key, so it produces a
`claude-only-frontmatter-stripped` warning and the compile proceeds.

**Manifests as.** Converting a command to a skill trades a gated construct for
a merely reported one. Identical runtime behavior on the target, weaker record
in the compiler: the loss goes from "the build stops until you write it down"
to "it appeared in a warning list nobody has to read."

**Affects.** Every package that moved a command to a skill, or authored a skill
with a tool allowlist. Already stated per-plugin in cc-marketplace
`docs/agentforge-compatibility.md` — hoisted here because it is a property of
the compiler, not a fact about any one plugin.

**Evidence.** Established 2026-08-02. Read directly off the two code paths:
`src/compatibility.ts:109` pushes `command-tools-filter` for
`artifactType === 'command'` and for no other type; the skill path reaches only
the frontmatter-stripped warning in `src/render.ts:140`.

**Status.** by-design — but worth knowing before you read a warning list as an
exhaustive loss report.

**Where to look.** `src/compatibility.ts:102-111` — the artifact-type branch.
`src/targets/package-payload.ts:202` — `gateUndeclaredLosses`.
`src/render.ts:140` — the warning that fires instead, for skills.

---

## L-003 — `$ARGUMENTS` resolves inside skill bodies, not only command bodies

**Gap.** The token is a live substitution site in a **skill** body, not just a
command body. Any passage that reads as self-documenting prose — a skill that
explains `$ARGUMENTS` to a reader, or quotes it in an example — is a
substitution site at runtime. The compiler has no way to tell "this body
documents the token" from "this body uses the token"; the only escape is the
`documents:` document class in `PACKAGE.yaml`, which exempts a whole file from
body scanning.

**Manifests as.** Two ways. At runtime on Claude: prose that was meant to
describe the token gets the invocation's arguments spliced into it. In the
corpus audit: sites get classified as prose when they are live, undercounting
the real substitution surface.

**Affects.** Any skill whose body mentions the token. Concretely today: the
measured-corpus table in Linear **JUN-354** classifies three sites in `compass`
as prose. That classification is wrong and the ticket needs a correction — not
yet filed as of 2026-08-03.

**Evidence.** Verified empirically 2026-08-02: a throwaway plugin was loaded
whose *skill* body wrapped `$ARGUMENTS` in delimiter markers; invoking it with
a nonce returned the nonce inlined between the markers.

**Status.** open (the JUN-354 miscount, and the compiler's inability to
distinguish mention from use). by-design (the substitution behavior itself —
that is Claude's, and the capability table already records it correctly).

**Where to look.** `src/capabilities.ts` — `CLAUDE_TOKENS`, and the
`codex/skill` row that already marks `$ARGUMENTS` unsupported.
`src/compatibility.ts` — `scanBody`, which runs over every artifact type
already; the gap is in classifying the corpus, not in the scan.
`src/definitions.ts:108` — `DocumentClass`, the only mention-vs-use escape
hatch that exists.

---

## L-004 — Policy-gated skills lose natural-language invocation on Codex

**Gap.** `disable-model-invocation: true` translates to
`allow_implicit_invocation: false` in `agents/openai.yaml`. Codex implements
that by omitting the skill from the model's context **entirely**, not by merely
gating auto-trigger. The skill is still invocable explicitly from the
`$`-picker as `$plugin:skill`.

**Manifests as.** A user asking for the skill in natural language gets no
routing — the model cannot suggest or select a skill it was never shown. The
same skill runs fine when picked explicitly. On Claude the same frontmatter
leaves the skill visible and merely un-auto-triggered, so the two harnesses
behave differently under identical source.

**Affects.** Every package skill carrying `disable-model-invocation: true`,
rendered to Codex. Testers comparing Claude and Codex behavior will see this
first and are likely to file it as a bug.

**Evidence.** Verified 2026-08-02 against codex-cli 0.146.0: a policy-gated
skill is absent from the model's catalog and still runs from the `$`-picker.
The published page (learn.chatgpt.com `build-skills.md`) says only that Codex
"won't implicitly invoke the skill", which reads as auto-trigger gating; the
0.146.0 binary's embedded skill-creator doc is the complete statement — "the
skill is not injected into the model context by default, but can still be
invoked explicitly via `$skill`". See L-005.

**Status.** by-design. This is a **faithful** translation of the source
frontmatter and takes no declared loss. It is recorded here as a behavior
difference testers must know, not as a defect.

**Where to look.** `src/render.ts:176-188` — where the policy file is emitted,
with its path taken from the capability table so the two cannot drift.
`src/capabilities.ts:67` — `CODEX_TRANSLATIONS`.
`src/targets/codex-marketplace.ts:494` — the marketplace-path emission.

---

## L-005 — A capability row citing only published docs can be incomplete

**Gap.** Capability-table rows carry one documentation citation each, and a
vendor's published page can describe a behavior imprecisely enough to point the
wrong way. Nothing in the table's shape distinguishes "cited the complete
statement" from "cited the only statement we found".

**Manifests as.** An investigation that should have been a lookup. The
`codex/skill` row cited only learn.chatgpt.com `build-skills.md`, whose wording
describes only auto-trigger gating; settling what
`allow_implicit_invocation: false` actually does (L-004) cost a full
investigation before the codex binary's embedded doc resolved it.

**Affects.** Any capability row whose only source is a vendor's public
documentation page — that is most of them.

**Evidence.** Established 2026-08-02, resolved the same day when the codex-cli
0.146.0 embedded skill-creator doc supplied the complete wording. Fixed in
PR #4, commit `4fee428`, which added that wording to the `codex/skill` row.

**Status.** fixed-in `4fee428` — for this row. The general lesson stands and is
the durable part of this entry: **when a target ships a binary with embedded
docs, read those alongside the published page, and cite both.** A vendor's
marketing-facing page states the effect a user notices; the embedded doc states
the mechanism.

**Where to look.** `src/capabilities.ts:92` — the `codex/skill` row's `source`
string, which now carries both citations and the verification date.

---

## L-006 — A compiled Codex projection only reaches a runtime if the marketplace root points at the compile output

**Gap.** Both the in-repo `.agents/plugins/marketplace.json` and the compiled
one carry the identical relative entry `"path": "./plugins/<name>"`. That path
resolves to the canonical Claude source when read from inside the repo, and to
the Codex projection when read from inside AgentForge compile output.
Registering the repo itself as a Codex marketplace therefore installs canonical
source in place of the projection. Nothing errors, warns, or validates against
it — the manifest is well-formed and every path in it resolves.

**Manifests as.** Installed Codex plugins carry Claude-only frontmatter
verbatim — `disable-model-invocation`, `allowed-tools`, `argument-hint`,
`effort` — and lack every generated artifact: `agents/openai.yaml` invocation
policies, translated hook configurations, inferred role procedures. Declared
intent looks satisfied when you read the source, while nothing enforces it at
runtime.

The failure is silent in both directions: the keys Codex cannot read are
present, and the files that would have done the work are absent.

**Affects.** Every Codex-enrolled plugin as installed on this machine today —
`commit`, `craft`, `feedback`, `librarian`, `linear`, `spec-flow`, and now
`compass`. Only artifacts hand-committed into the source tree survive the wrong
path, which is why `craft`'s `grok` and `zoom-out` policies work by accident
while `librarian`'s four generated policies do not.

**Evidence.** Verified 2026-08-03. `codex plugin marketplace list` shows
`cc-marketplace` rooted at `/Users/jacob/Projects/cc-marketplace`. Compiling
`MARKETPLACE.yaml` with the pinned compiler emits
`codex/plugins/compass/skills/reflect/agents/openai.yaml`, and the same for
`mull` and `converge`; the installed cache at
`~/.codex/plugins/cache/cc-marketplace/compass/0.9.0` contains none of them. A
fresh Codex session reports `compass:converge`, `compass:mull`, and
`compass:reflect` all present in its catalog — implicitly invocable, the
opposite of what their `disable-model-invocation: true` declarations intend —
while `craft:zoom-out` is correctly absent. A frontmatter diff of `reflect`'s
`SKILL.md` shows five Claude-only keys present in the installed copy that the
projection strips.

**Status.** open. The compiler is **not** at fault — it emits the projection
correctly. This is a setup and documentation gap in how a Codex runtime is
pointed at that output. It belongs in this register because the tooling permits
the mistake silently.

**Where to look.** `src/targets/codex-marketplace.ts:519` — `compilePackage`
builds `source: './<packageDirectory>'` from the *source* tree layout, which is
why the compiled manifest and the in-repo manifest agree byte-for-byte on the
path. `src/targets/codex-marketplace.ts:200-205` — where that string becomes
the manifest's plugin entry. cc-marketplace `README.md:78-85` — documents
compiling to `/tmp/cc-marketplace-agentforge` and validating there, but does
not say that the Codex runtime must be **registered** against that path rather
than against the repo.

**Why this one went undetected.** This trap survived six plugin enrollments and
two smoke tests that were run and recorded as passes: the JUN-342 `feedback`
Codex acceptance, and the `craft:zoom-out` invocation verification. Neither
surfaced it — `feedback` has no generated artifacts to be missing, and
`craft`'s policies happen to be committed into the source tree, so both passed
against canonical source without ever exercising the projection. A passing
smoke test on the wrong root is indistinguishable from a passing smoke test on
the right one. That is the strongest argument for this register existing at
all.
