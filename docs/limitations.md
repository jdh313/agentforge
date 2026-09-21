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

Entries, decision atoms, and test comments sometimes cite a `.docs/…` companion
document. Those are pre-implementation contracts that stay local to the
authoring checkout and are not published with this repo; treat such a citation
as provenance for where a decision was settled, not as a reference you are
expected to follow. The same holds for `linear:` and `shortcut:` refs, which
point into a private tracker.

When new evidence shows an entry was **scoped too narrowly** — wrong targets,
wrong severity, wrong blast radius — amend it in place under the same ID rather
than filing a second one. Two IDs for one gap is how a register starts lying
about how many gaps it has. Lead the amended entry with a dated note saying what
the earlier framing got wrong, so a reader who cited the old version can tell
whether their citation still holds.

---

## L-001 — An unrecognized canonical frontmatter key was discarded with nothing reported

> **Amendment history.** Written 2026-08-02 as a Codex-scoped visibility gap.
> Widened 2026-08-03: the key was destroyed in the **Claude** projection too,
> for a runtime that supports it, and the defect was already **published**.
> Amended again 2026-08-03 on the fix — a second live instance surfaced, and it
> reframed the gap. Same ID throughout.
> Amended 2026-09-14 after `ndr:4x4yyv` superseded provisional Claude
> pass-through: unrecognized keys are now reported and stripped on every target.
>
> **Do not read this entry as "stripping keys is bad."** One of its two
> instances *should* have been stripped. See "The lesson" below before citing
> this entry.

**Gap.** The canonical schemas were closed `z.object`s. Any frontmatter key
they did not enumerate was discarded by zod at parse — before any target
adapter ran, and before the construct detector saw the artifact. Everything
downstream followed from that one fact: no warning could name the key (the
value was already gone), and no package could declare it as a loss, since
`CLAUDE_ONLY_CONSTRUCTS` had no token for it.

The real defect was **not** that keys were dropped. It was that the compiler
could not distinguish *"we decided this key does not belong on this target"*
from *"we have never heard of this key"* — and said nothing in either case. A
strip and a blind spot produced byte-identical output.

**Manifests as.** A constraint or annotation present in canonical source is
absent from every projection, including the Claude one. Nothing errors, nothing
warns, nothing appears in the compatibility report. A reviewer reading canonical
source sees the key; a reviewer reading compiled output has no way to tell it
ever existed.

**Affects.** Every target, including `claude`. Two live instances were found.

**Instance 1 — `disallowed-tools`. The strip was wrong.** Claude *supports* this
key; destroying it in the Claude projection removed a constraint a runtime would
have honored. Load-bearing for `compass`: its `reflect` and `mull` skills
enforce a never-web-search, never-delegate stance *only* through
`disallowed-tools`. Also carried by `craft` and `librarian`.

**Instance 2 — the `upstream:` provenance block. The strip was correct.**
Twelve skills carry it — `craft` ×9, plus `skillsmith/writing-great-skills`,
`teach/teach`, and `pm/breakdown` — and every projection was destroying it,
Claude included. But `upstream:` is an **authoring-layer** convention:
`skillsmith:upstream-review` reads and writes it against canonical source,
refreshing `reviewed_sha` in place, and Claude Code does nothing with it.
Shipping it to a target would have been *wrong*. What was defective here was the
silence, not the strip.

Two further hits are **not** instances: `skillsmith/skills/upstream-review/SKILL.md`
and `skillsmith/README.md` carry `upstream:` at line start in the **body**,
documenting the convention rather than using it. The count is twelve. An earlier
count of thirteen came from a line-start grep that did not distinguish
frontmatter from body.

**The lesson.** A strip must be **decided and reported**, not incidental. The
naive reading of this entry — "the compiler dropped keys, dropping keys is bad"
— points a reader at exactly the wrong fix. Instance 2 is the counterexample
that makes the real rule legible: the right behavior for an authoring-layer key
is to strip it from every target *and say so was intended*. Silence is what made
a correct strip and an incorrect one indistinguishable.

**Resolution shape.** Three categories now exist, and the distinction between
them is the fix:

| Key kind | Claude | Other targets | Reported |
| --- | --- | --- | --- |
| Known Claude key | retained | stripped | `claude-only-frontmatter-stripped` |
| Unrecognized key | stripped | stripped | `unrecognized-frontmatter-key`, on every target including Claude |
| Declared authoring-layer key (`authoring-keys` in `PACKAGE.yaml`) | stripped | stripped | nothing — a declared strip is not a loss |

The checked-in acceptance table is the authority for emission. An unrecognized
key survives canonical parsing so the compiler can report it, then is stripped
on every target until that table names it. This avoids treating source-dialect
provenance as evidence that a runtime accepts a field.

**Evidence.** Established 2026-08-02 during a drafting session. The findings
that escalated it, verified 2026-08-03:

1. **The Claude projection dropped it.** Canonical source at
   `plugins/compass/skills/reflect/SKILL.md` carries `disallowed-tools` with
   `WebSearch`, `WebFetch`, and `Agent`. The compiled `claude/` projection of
   that same file did not.
2. **It reached publication.** The installed copy under
   `~/.claude/plugins/marketplaces/<mirror>/plugins/compass/skills/reflect/SKILL.md`
   — the published mirror that other machines install from — had no
   `disallowed-tools`. `reflect` and `mull`, whose entire stance is
   never-web-search and never-delegate, shipped in a form where nothing
   prevented either. That was a live correctness defect in published output, not
   a latent gap. **Republishing is the remaining work; the code fix alone does
   not repair already-published artifacts.**
3. **Local Claude did not show it** because the cc-marketplace Claude
   marketplace is registered as a Directory pointed at the repo, so it reads
   canonical source, where the key survives. Same accident as L-006: a
   wrong-path install preserving what the right-path projection destroys.
4. **Leaf-renderer probe.** A probe skill carrying
   `disallowed-tools: WebSearch, Task` rendered to both `claude` and `codex`
   produced output frontmatter of `name` + `description` only, zero warnings on
   either target.

Commands and agents were the lone exception, and only by accident: they are
emitted as verbatim source bytes on the Claude marketplace path
(`claude-marketplace.ts:109`), so the key rode along unexamined.

**Status.** fixed-in `7a7922b` — round-trips `disallowed-tools` into the Claude
projection (instance 1). Class fix in `7c45610` — canonical schemas are now
`z.looseObject`, so an unrecognized key survives to the target, which decides
and reports. Authoring-layer declaration in `35b97d7` — `authoring-keys` in
`PACKAGE.yaml` makes a strip deliberate and silent (instance 2). All three
merged to agentforge `main`.

Kept rather than deleted, per the how-to above and the precedent L-005 sets: the
evidence is the durable part, and a register that prunes its fixed rows cannot
tell you whether something was ever a problem.

**Where to look.** `src/schema.ts` — `CanonicalSkillFrontmatter` /
`CanonicalOutputStyleFrontmatter`, now `z.looseObject`; `canonicalKeys` on each
`ARTIFACT_DEFS` entry is what "unrecognized" is measured against;
`disallowed-tools` is now enumerated in the checked-in acceptance table in
`src/frontmatter.ts` with Claude as its sole retaining target.
`src/target-adapter.ts` — the target and artifact contracts.
`src/render.ts` — authoring-key removal first, then checked-in key filtering and
the unrecognized-key warning. `src/definitions.ts` —
`authoring-keys` on `CanonicalPackage`. `src/types.ts` —
`unrecognized-frontmatter-key`, and the comment on why it is kept distinct from
`claude-only-frontmatter-stripped`.

**The asymmetry that pointed at the fix.** `ndr:17dhph` had already opened the
**output** side, validating generated native documents with `z.looseObject`
*specifically* to retain unrecognized keys — see the loose schemas throughout
`src/targets/codex-marketplace.ts` and `src/targets/claude-marketplace.ts`. The
input side stayed closed by default. Canonical frontmatter was the one place in
the pipeline where an unrecognized key was silently discarded rather than
carried, and the one place where the author's intent enters. `7c45610` closed
that asymmetry by opening the input side to match.

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
`src/compatibility.ts:110` pushes `command-tools-filter` for
`artifactType === 'command'` and for no other type; the skill path reaches only
the frontmatter-stripped warning in `src/render.ts:200-205`.

**Status.** by-design — but worth knowing before you read a warning list as an
exhaustive loss report.

**Where to look.** `src/compatibility.ts:102-111` — the artifact-type branch.
`src/targets/package-payload.ts:203` — `gateUndeclaredLosses`.
`src/render.ts:200-205` — the warning that fires instead, for skills.

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

**Where to look.** `src/render.ts:239-251` — where the policy file is emitted,
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

## L-006 — A compiled Codex projection only reaches a runtime if the marketplace root points at the compile output *and* installed plugins are rebuilt from it

> **Amendment history.** Written 2026-08-03 as a marketplace-root gap. Widened
> the same day: pointing the root correctly is necessary but not sufficient —
> already-installed plugins keep serving their pre-existing cache until
> reinstalled, with nothing reporting the staleness. Same ID; see "Scope
> widened" below.

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
`cc-marketplace` rooted at `<cc-marketplace-repo>`. Compiling
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

**Status.** resolved for cc-marketplace 2026-08-03; the underlying gap stays
**open**. The compiler is **not** at fault — it emits the projection correctly.
This is a setup and documentation gap in how a Codex runtime is pointed at that
output, and nothing in the tooling has changed to prevent the same mistake in
another consumer, so the entry stays here rather than being marked `fixed-in`.

**Scope widened 2026-08-03: pointing the root correctly is necessary but not
sufficient.** Re-registering the marketplace at the compile output does **not**
refresh plugins that are already installed. Each keeps serving its existing
cache under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` until it
is explicitly reinstalled, and nothing reports the staleness: `codex plugin
list` prints the *marketplace* path for every entry, so a plugin serving
months-old bytes is visually indistinguishable from one serving the new
projection. The version directory is keyed by version, so an unchanged version
number means a stale cache is never invalidated. `codex plugin add <name>@<mkt>`
on an already-installed plugin rebuilds it in place.

**Evidence, 2026-08-03 (resolution).** cc-marketplace `9e83c78` commits complete
publications under `marketplaces/` and points each runtime at its own root.
After `codex plugin marketplace add
<cc-marketplace-repo>/marketplaces/codex`, all seven pilots
resolve under that root and the publication carries all ten generated
`agents/openai.yaml` policies.

The caches did not follow. Immediately after the repoint, `spec-flow`'s cache
held no sidecar at all while `librarian`'s four were dated `2026-07-12` —
pre-migration bytes that happened to contain sidecars for historical reasons,
not the new projection. A fresh `codex exec` session confirmed the consequence:
`spec-flow:spec-flow` was present in the loaded skill catalog despite being
policy-gated. Reinstalling all seven brought every cache to exactly the
publication's ten sidecars (compass 3, craft 2, librarian 4, spec-flow 1;
commit, feedback, and linear correctly zero).

Re-probed after the refresh, and the translation verifies end to end: all ten
policy-gated skills are absent from the loaded catalog while `spec-flow:draft`,
`commit:commit`, and `librarian:wiki-query` remain present, and
`$compass:reflect` still loads the gated skill body on explicit invocation,
quoting its first instruction verbatim. Installed frontmatter is the projection
— `name` and `description` only, not canonical Claude source with its five
Claude-only keys. The stale `cc-codex-test` marketplace rooted at `/private/tmp`
has been removed.

**An earlier draft of this paragraph called the gap resolved on the strength of
the publication alone.** It was measured against `marketplaces/codex/`, which is
compiler output, not against what the runtime had loaded. That is the same
mistake this entry exists to record, one layer down: reading the artifact you
produced instead of the artifact the runtime resolved.

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

---

## L-007 — Files the compiler does not carry are dropped with nothing reported

**Gap.** A skill's publication surface is `SKILL.md` plus the three allowlisted
resource subdirs (`scripts/`, `references/`, `assets/`); a package's is what
`payloads:` declares. Anything else in a source directory is not copied — and,
unlike a stripped frontmatter key or an untranslatable body construct, its
omission produces no warning, note, or diagnostic. The compiler reports lossy
*translation* thoroughly and lossy *omission* not at all.

**Manifests as.** An installed skill whose body links to a sibling file that
does not exist. The reader follows a `[GLOSSARY.md](GLOSSARY.md)` pointer in
the published `SKILL.md` and finds nothing there. Because canonical source and
publication were colocated before cc-marketplace `9e83c78`, the link resolved
against the source tree and the gap was invisible; separating the publication
is what exposed it.

**Affects.** Claude and Codex, every skill artifact. Confirmed today in
cc-marketplace: `skillsmith/writing-great-skills` linked `GLOSSARY.md` and
`ADDENDA.md` from its body with neither in the publication (fixed at source by
moving both into `references/`); `pm/skills/breakdown/UPSTREAM.md` and
`skillsmith/skills/writing-great-skills/UPSTREAM.md` are dropped but
deliberately unreferenced, so harmless; and 14 package-level `README.md` files
are dropped from the Claude publication because no `PACKAGE.yaml` declares one
as a payload.

**Evidence.** Verified 2026-08-03 against the pinned compiler `0ebebbb`. A link
check resolving every relative `.md` link in all 296 published files reported
exactly two broken targets, both in `writing-great-skills`. Enumerating source
files under each package and subtracting the Claude publication returned 18
absent files: 14 `README.md`, 2 `UPSTREAM.md`, 1 `GLOSSARY.md`, 1 `ADDENDA.md`.
No compile diagnostic mentioned any of them; the same run emitted 40+ notes and
warnings about stripped keys and untranslatable constructs.

**Status.** open. The omission itself is by design — an allowlist is the right
default, and `payloads:` is the intended escape hatch for package files. What
is not by design is the silence: a package author has no way to learn that a
file they wrote was left out, and the failure surfaces only as a dead link in
an installed artifact. Contrast L-001, where the fix was precisely to report a
key rather than to stop discarding it; the same argument applies here.

**Where to look.** `src/render.ts:221-226` — `resourcePaths` walks only the
subdirs in `artifactConfig.resourceSubdirs`, so a sibling file at the skill root
is never enumerated. `src/render.ts:195-198` — a second filter drops anything
whose first path segment is not an allowlisted subdir. `src/targets/claude.ts:38`
and the matching declarations in `codex.ts`, `opencode.ts`, `pi.ts`, and
`claude-chat.ts` —
where the three-subdir allowlist is declared, identically, on every target.
`src/package-payload-plan.ts:34-92` — the package-level `payloads:` path, which
errors on a declared source matching no files but says nothing about an
undeclared file that exists.

**Why this one went undetected.** The same reason as L-006, one level down.
While canonical source and publication shared a directory, every intra-skill
link resolved whether or not the compiler published its target, so no reader
could tell the difference. Committing the publication as a separate tree is
what made the omission observable, and a link check across the published tree
is what turned it into a finding. A cheap invariant — every relative link in a
published body resolves inside the publication — would have caught it years
earlier and belongs in the compiler rather than in a consumer's CI.

---

## L-008 — An agent's `model:` and `effort:` pins are dropped with nothing naming them

**Gap.** The construct detector reads exactly one field out of agent
frontmatter: `tools:`, which feeds `agent-tools-filter`. Nothing reads `model:`
or `effort:`. A target that cannot honour a model pin therefore drops it with no
construct to attach a diagnostic to, and `CLAUDE_ONLY_CONSTRUCTS` is a closed
enum, so an author cannot declare the loss either — a `losses` entry naming a
construct outside that enum fails schema validation rather than passing through.
The gap is not that the pin is unenforceable on Codex, which is expected; it is
that neither the compiler nor the author has any way to say so.

**Manifests as.** An agent the author deliberately pinned to a stronger model
runs at whatever the session model happens to be, and no output distinguishes
that from an agent that never expressed a preference. The
`inferred-artifact-projection` note does say "Claude model, turn, and tool
constraints remain in the retained source and are not enforced by Codex", but it
is fixed boilerplate emitted for every projected agent and never names the
pinned value — so it reads identically whether an agent pins `opus` or inherits.
A reader auditing the diagnostics cannot tell the two apart.

**Affects.** Codex, every projected agent. Confirmed today in cc-marketplace:
`shake-tune` tiers five analyzer agents deliberately — `opus`/high on
`belt-analyzer`, `shaper-analyzer`, and `vibration-analyzer` (the PSD and
spectrogram interpretation roles), `inherit`/low on `axes-map-analyzer` and
`excitate-analyzer` (mechanical checks) — and none of that survives or is
reported. `coach` (3 agents), `debate` (4), `librarian` (4), `skillsmith` (1),
and `spec-flow` (2) project agents through the same path; `librarian` and
`spec-flow` have shipped this way since the pilot.

**Evidence.** Verified 2026-08-03 against the pinned compiler `0ebebbb`.
Grepping `src/compatibility.ts` for agent-frontmatter reads returns `tools` only
(`compatibility.ts:107`); `model` and `effort` appear nowhere in the detector.
`CLAUDE_ONLY_CONSTRUCTS` (`src/definitions.ts:59-69`) enumerates
`agent-tools-filter`, `command-tools-filter`, `mcp-tool-reference`,
`body-template-variable`, `body-shell-injection`, and `body-file-reference`; a
`losses` entry's `construct` is `z.enum(CLAUDE_ONLY_CONSTRUCTS)`
(`definitions.ts:74`), so an invented `agent-model-pin` is rejected at
validation. A full compile of the fourteen-package Codex publication emitted no
diagnostic naming any pinned model.

**Status.** open; this is an explicit input to the canonical-agent work in
[`docs/roadmap.md`](roadmap.md#08--canonical-agents). The workaround in the
field today is prose: `shake-tune`
documents its tiering inside the note attached to its `agent-tools-filter`
declaration, which keeps the fact visible but attaches it to an unrelated
construct and only works for a package that happens to declare some other loss.
An agent-bearing package with no `tools:` filter has nowhere to put it at all.

**Where to look.** `src/compatibility.ts:107` — the agent-frontmatter read,
which handles `tools` and stops. `src/definitions.ts:59-69` — the closed
construct enum. `src/definitions.ts:74` — the `z.enum` that makes the set closed
in practice rather than by convention. `src/targets/codex-marketplace.ts` — the
`inferred-artifact-projection` emitter, whose message is a constant rather than
a description of what this particular agent lost.

**Why this one went undetected.** L-001's shape, one field over. A stripped
`disallowed-tools` was invisible because nothing enumerated the key; a dropped
`model:` is invisible because nothing enumerates the key *and* a plausible-looking
note already appears next to the agent, which reads like coverage. The boilerplate
is the active harm here: a reader who sees "Claude model … constraints are not
enforced" reasonably concludes the case is handled and reported, when the sentence
would print identically if the field did not exist. Silence is easier to notice
than a generic sentence that is technically true.

---

## L-009 — Hook-event support lives outside the capability table

> **Amendment history.** Written 2026-08-03. Fixed 2026-08-09 — a `hook` surface
> now exists in the table and the adapter's `Set` is gone. The 0.147.0
> re-verification also confirmed the old list was **correct**, which is the point
> worth keeping: this entry was never about a wrong answer, it was about an
> unciteable one.

**Gap.** `ConstructSurface` admits `skill` and `prompt` only, so the capability
table has no `hook` surface and `supportFor` cannot be asked whether a hook event
exists on a target. That fact instead lives in a hardcoded `Set` inside the Codex
marketplace adapter, whose only citation is a code comment. Every other capability
claim in the compiler carries a per-row doc citation precisely because a target's
behaviour cannot be observed locally; hook events are exempt from that discipline
by accident of where they are stored.

**Manifests as.** Nothing visible while the list is correct — which is the
problem. A Claude hook event absent from the set is silently treated as having no
Codex analog, and one wrongly present would translate into a handler for an event
the target never fires. Neither outcome produces a diagnostic distinguishable
from a correct one, and the three-valued `supported`/`unsupported`/`unknown`
result that keeps the rest of the table honest is unavailable here: the `Set`
answers yes or no, never "not established".

**Affects.** Codex, every hook-bearing package. Today that is `commit`
(`PreToolUse`) in the publication, and `langfuse` (`Stop`, `SessionStart`) in
source but deliberately unenrolled — see the `langfuse` entry in cc-marketplace
`docs/agentforge-compatibility.md` and `ndr:7gf4vb`. Small blast radius now,
growing with every hook a package adds.

**Evidence.** Verified 2026-08-03 against the pinned compiler `0ebebbb`.
`src/capabilities.ts:8` defines `ConstructSurface` as `'skill' | 'prompt'`;
no `hook` row exists anywhere in the table. `CODEX_HOOK_EVENTS`
(`src/targets/codex-marketplace.ts:36-48`) lists `PreToolUse`,
`PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionStart`, and
`SessionEnd`, above a comment reading "per the Codex hooks reference". The set
was checked independently against the embedded JSON schemas in the codex 0.146.0
binary and is accurate as of that version — but that check was manual and leaves
no artifact in the repo, which is exactly what a citation column exists to fix.

**Evidence, 2026-08-09 (resolution).** Re-probed against codex-cli **0.147.0**,
reproducibly this time — the command is now in the row's `source` string, so the
next reader re-runs it instead of trusting a claim. `strings` over the binary,
filtered to hook-context blobs, yields a maximal `HookEventsToml` field set of
exactly the eleven events the old `Set` listed. `Notification` occurs 189 times
in the binary overall and in **zero** hook blobs: an established absence, not an
unreviewed one, which is why it is listed as `unsupported` rather than left to
resolve as `unknown`.

Two traps worth recording, because both produce a confident wrong answer:

1. `grep -cx` against the binary returns **zero for every event**, including
   ones Codex certainly fires. Rust interns strings into concatenated blobs, so
   nothing is ever alone on a line. A whole-line match here reads as "Codex
   supports no hooks at all"; the probe was broken, not the answer.
2. Counting a bare substring is equally useless in the other direction —
   `Notification`'s 189 hits are JSON-RPC and MCP traffic. Only adjacency to
   `HookEventsToml` / `trusted_hash` discriminates.

**Status.** fixed-in working tree (uncommitted as of 2026-08-09). A
`codex/hook` row now carries the event set plus the probe that established it,
and `translateHookConfiguration` branches on `supportFor('codex', 'hook', …)`.
The three-valued return is what the `Set` could not express: an event outside
the table now reports `unclassified-hook-event` ("we have never ruled on this")
rather than `unsupported-hook-event` ("we established Codex does not fire
this"). Neither gates the compile and both drop the event — emitting a handler
for an event the target may never fire is the worse failure — per ndr:szdn5s,
which already governs the same split for body constructs.

**Not fixed: the second uncited fact.** `SESSION_END_TIMEOUT_CAP_SECONDS`
remains a literal. `CapabilityRow` carries token lists, not numeric limits, so
housing it would mean extending the row shape — a separate change. It now at
least carries a verification date and a note saying why it is not in the table.
ndr:bm3m2j governs the behavior (warn, do not clamp) wherever the number lives.

**Where to look.** `src/capabilities.ts` — the three-member `ConstructSurface`
union, `CODEX_HOOK_EVENTS`, and the `codex/hook` row with its reproducible
citation. `src/targets/codex-marketplace.ts` — `translateHookConfiguration`'s
three-way branch, and `SESSION_END_TIMEOUT_CAP_SECONDS` with its standing-gap
note. `tests/codex-hook-projection.test.ts` — the `triage` fixture asserting
that a confirmed-absent and an unclassified event report differently while a
supported sibling still projects.

**No `claude/hook` row exists, deliberately.** Nothing queries one: the Claude
marketplace path emits hook configurations verbatim. A row would have to
enumerate every Claude event to be honest, and an under-populated one would make
real events resolve as `unknown` on the source dialect — worse than the absent
row, which nothing consults.

**Why this one went undetected.** The adjacent code got it right, which is what
hid it. `HOOK_ENV_TRANSLATIONS` a few lines below pulls its data from the
capability table and carries a comment explaining that keeping a second literal
list "is how the fact drifted out of the model in the first place" — so the file
demonstrates the correct pattern and the incorrect one within twenty lines of
each other. A reviewer reading for table-sourced facts would find one and stop.
The gap surfaced only when a package needed an answer the table could not be
asked for, and the correct answer had to be recovered from a vendor binary.

---

## L-010 — Codex plugin packages cannot register agent roles

**Gap.** A canonical `AGENT.md` now projects to native Codex agent-role TOML at
the leaf (`src/targets/codex.ts`, `NativeAgentDocument`), but that native form
has nowhere to land inside a compiled Codex marketplace package. Codex agent-
role discovery is keyed entirely to `ConfigLayerSource` — the same layer system
that resolves `config.toml` — and that enum has no `Plugin` variant. The plugin
manifest schema (`RawPluginManifest`: `mcpServers`, `apps`, `hooks`, `commands`,
`interface`) has no `agents`/`agentRoles`/`roles` field or path either. This is
not a gap in AgentForge's mapping; it is an absence in Codex itself, as of
codex-cli 0.154.0.

**Manifests as.** `translateAgentProcedure`
(`src/targets/codex-marketplace.ts`) still emits a package agent as a plain
Markdown procedure file at `<package>/agents/<name>.md`. Codex never loads this
file at all — it is not a registered role, not addressable, and not spawnable
as a subagent; it is retained only as inert prose a human or another artifact
could reference. The leaf projection's richer, enforced-shape TOML output has
no marketplace equivalent: a package author gets weaker agent semantics than a
leaf `AGENT.md` render, with no way to close that gap from this side.

**Affects.** Every Codex marketplace package with an `agent` artifact — today,
`librarian`'s `vault-reader` role in cc-marketplace (`tests/marketplace-adapters.test.ts`,
`tests/fixtures/definitions/cc-marketplace/packages/librarian/`).

**Reported as.** `body-agent-reference`, the declared loss behind the
`agent-reference` construct family (ndr:c5haze). A body naming an agent the
package declares is detected and must be declared under
`targets.codex.losses`, so this limitation now surfaces at the call site rather
than only here. Two bounds on that coverage, both deliberate:

- Resolution is **package-local**. A body naming a *sibling* package's agent —
  `teach` naming `librarian`'s `@vault-reader` — is not detected. Whether it
  should be is Fibery Charting #23, deferred rather than decided.
- The construct reports the *reference*, not the projection. The inert
  Markdown procedure `translateAgentProcedure` emits is reported separately as
  `inferred-artifact-projection`, which is what names this limitation for the
  agent file itself.

**Evidence.** Verified 2026-09-15 against the installed `codex-cli 0.154.0`
binary (`strings` plus targeted byte-offset dumps; no `codex exec` session was
started). The agent-role loader's demangled symbol table contains exactly three
functions in `codex_agent_roles::loader`
(`agents_toml_from_layer`, `push_agent_role_warning`, `merge_missing_role_fields`);
`agents_toml_from_layer` reads roles per `ConfigLayerSource`, whose reflected
variant list is exhaustively `Project`, `PackagedDefaults`, `Mdm`,
`LegacyManagedConfigTomlFromFile`, `User`, `EnterpriseManaged`, `System` — no
`Plugin` member. Independently, the plugin manifest deserializer's reflected
field set (`core-plugins/src/manifest.rs`) enumerates `mcpServers`, `apps`,
`hooks`, `commands`, `interface` and their untagged-enum variants, with no
agents-shaped field anywhere. Third-party documentation
(`codex.danielvaughan.com`, "Codex CLI Plugin System", queried 2026-09-15)
independently states a Codex plugin bundles "Skills ... MCP Servers ... App
Connectors" — agent roles are absent from that list too. Two independent
sources agree with no contradiction.

**Status.** open, upstream. `translateAgentProcedure`'s Markdown-procedure
mapping remains the intended fallback per `ndr:msdg46`, not a placeholder for
something better — there is currently nothing better to fall back from.

**Revisit trigger.** Re-run the same two checks (`ConfigLayerSource` variant
list; `RawPluginManifest` field set) against each Codex CLI version this repo's
tooling targets. Revisit this entry the moment either check finds a
`ConfigLayerSource::Plugin` variant or an `agents`-shaped field in
`RawPluginManifest` — at that point the leaf TOML serializer in
`src/targets/codex.ts` should be reachable from
`src/targets/codex-marketplace.ts`'s `translateAgentProcedure` instead of a
parallel serializer, per the shared-mapping discipline `ndr:9n1m1a` and
`ndr:w3z7h3` already require.

**Where to look.** `src/targets/codex.ts` — the leaf `NativeAgentDocument`
that has no marketplace path to reuse it from yet. `src/targets/codex-marketplace.ts` —
`translateAgentProcedure`'s reworded `inferred-artifact-projection` note, which
now states the absence explicitly instead of implying it is this repo's
omission. `docs/roadmap.md` 0.8 boundary item 5 — already conditions
marketplace reuse on native registration being available, which this entry is
the concrete case of it not being.

---

## L-011 — Codex does not apply custom agent roles to spawned children

**Gap.** A canonical leaf `AGENT.md` projects to native Codex agent-role TOML
via the native `NativeAgentDocument` form in `src/targets/codex.ts`, which
installs correctly at `.codex/agents/<name>.toml` and parses without error when
registered via `.codex/config.toml` `[agents.<role>]` with `config_file`. No
observed registration path (standalone TOML, config_file + relative path, or
any feature-flag combination) results in a spawned child applying the custom
role's `name`, `developer_instructions`, or `model_reasoning_effort`. On codex-cli
0.154.0 the child always inherits the parent's generic model and effort,
regardless of what roles are loaded; the spawn tool apparently offers no
role-selection parameter (inferred, see Evidence). This is distinct from L-010: the role file exists and parses; it is
simply not selected at spawn time.

**Manifests as.** A generated agent TOML file that installs correctly and
produces zero errors or warnings, while spawned children continue to use the
parent's model and effort instead of the configured override. The custom
`developer_instructions` marker never reaches the child's transcript, so custom
behavior is silently replaced with generic defaults. The file is inert at
runtime.

**Affects.** Codex leaf `agent` projection (`src/targets/codex.ts`,
`NativeAgentDocument`). Generated TOML installs correctly but is not applied to
spawned children on codex-cli 0.154.0.

**Evidence.** Tested on codex-cli 0.154.0, 2026-09-16. Three `codex exec --json`
delegation runs used a role with a nonce-bearing `developer_instructions` that
would appear in the child's transcript if applied:
1. Standalone `.codex/agents/probe_role.toml` with `--enable multi_agent_v2`
2. The same file with `--enable multi_agent --disable multi_agent_v2`
3. Project `.codex/config.toml` with `[agents.probe_role]` and
   `config_file = "./roles/probe_role.toml"`, under default flags

In all cases, the child's rollout trace carried `agent_role: null`,
`developer_instructions: null`, and inherited the parent's `model` and
`reasoning_effort`. The `config_file` form loads without error (confirmed by
`codex -C <dir> debug prompt-input` running cleanly), so registration succeeds
up to parse time; selection at spawn does not happen. Every run, under
either feature-flag combination, reported `multi_agent_version: "v2"`. The spawn tool schema was not inspected directly
(inferred from model-visible system prompt prose and observed child metadata
only), so absence is evidenced by three runs all producing `agent_role: null`
rather than a structurally confirmed empty parameter set.

**Status.** open, upstream. codex-cli issues
[#26363](https://github.com/openai/codex/issues/26363) and
[#31097](https://github.com/openai/codex/issues/31097) describe the same
inherited-model and ignored-instructions behavior. The role loader exists in
the source and accepts the load paths; the linked issues place the gap in the
active spawn tool, which does not select a loaded role.

**Revisit trigger.** Re-run the nonce probe on a Codex CLI release where either
issue is resolved or the spawn tool exposes a role-selection parameter.

**Where to look.** `src/targets/codex.ts` — the leaf `NativeAgentDocument`
that generates the now-inert TOML. `docs/librarian-agent-acceptance.md` "Codex
leaf agent" section — the complete test matrix and probe details.

---

## L-012 — Codex never scans a repository's `.codex/agents`

**Gap.** Codex's agent-role loader discovers standalone role files by scanning
`$CODEX_HOME/agents` (default `~/.codex/agents`). It does not scan a
repository's `.codex/agents`, at any trust level, on codex-cli 0.154.0. The
adapter previously declared a `project` install location at
`join(projectRoot, '.codex/agents')` for the `agent` artifact, so
`agentforge install AGENT.md --target codex --scope project` wrote a role file
that codex never reads and exited zero.

This is distinct from both neighbouring entries. L-010 is a Codex *plugin
package* being unable to register roles at all; L-011 is a role that loads
correctly and is then not selected at spawn. L-012 is narrower and earlier than
either: at this one scope, the file is never loaded, so no later stage runs.

**Manifests as.** A successful-looking `install --scope project` whose output
is absent from every subsequent Codex run, with no warning at install time and
nothing in `codex doctor`. `check-install` agrees the file is present and
unchanged, because it compares bytes on disk against the plan — a question
that has nothing to do with whether the harness reads the path.

**Affects.** Codex leaf `agent` installation at project scope
(`src/targets/codex.ts`, `artifacts.agent.installLocations`). Resolved in this
repo by removing the scope, per ndr:d17fnt's requirement that a target omit
every scope it does not support and that each declared path be verified against
the target's own loader. A `--scope project` agent install for Codex now
refuses, naming `user` as the supported scope.

**Evidence.** Tested on codex-cli 0.154.0, 2026-09-17, with an isolated
`CODEX_HOME` and a dead `OPENAI_BASE_URL` so role loading runs to completion
before the network call fails.

The probe is a positive control, because Codex has no command that lists loaded
roles: plant a role file the loader must complain about, and see whether the
complaint appears. Silence then means the directory was never read. Two
independent triggers were used, each run once in `<repo>/.codex/agents` and
once in `$CODEX_HOME/agents` as the control:

| Planted file | `<repo>/.codex/agents` | `$CODEX_HOME/agents` |
| --- | --- | --- |
| two role files sharing one `name` | silent | `warning: Ignoring malformed agent role definition: duplicate agent role name \`vault-reader\` discovered in …/codexhome/agents` |
| a role file omitting `developer_instructions` | silent | `warning: Ignoring malformed agent role definition: agent role file at …/codexhome/agents/broken.toml must define \`developer_instructions\`` |

The project-directory runs were repeated with
`[projects."<repo>"] trust_level = "trusted"` in `config.toml`, with the same
silence. The only `.codex/agents` literal anywhere in the binary sits in the
`external-agent-migration` module, alongside `.claude.json` and `.codex/hooks`
— that is a Claude-Code importer's destination list, not a discovery root.

The same probes establish the positive half of the finding, which is stronger
than L-011's stated scope: at user scope a standalone role file is discovered
with **no** `[agents.<name>]` registration in `config.toml`, and AgentForge's
generated TOML loads there with no warning of any kind. `name`, `description`,
`model_reasoning_effort`, and `developer_instructions` are accepted as written
by `codexAgentDocument.serialize`.

**Status.** closed in this repo by scope removal; open upstream. Whether Codex
should scan a project-local role directory is an upstream product question, not
an AgentForge mapping gap.

**Revisit trigger.** A codex-cli release whose agent-role discovery reads a
repository-local directory. Re-run both positive controls in
`<repo>/.codex/agents`; a warning naming that path means the scope can be
declared again.

**Where to look.** `src/targets/codex.ts` — `artifacts.agent.installLocations`,
now user-only, with the reason recorded beside it. `src/install.ts` — the
refusal path, which names the scopes a target does declare. `tests/install.test.ts`
and `tests/install-cli.test.ts` — the refusal is asserted to write nothing at
all, not merely to warn.

---

## L-013 — A canonical agent's `skills:` has no Codex form: Codex's same-named role field can only remove skills

**Gap.** A canonical `AGENT.md` `skills:` (on Claude Code, skills preloaded
into the subagent at startup) has no Codex projection, and no value of any Codex
field can carry it. `AgentRoleOverrides` in codex-cli 0.154.0 does have a field
named `skills`, which is why this looks mappable, but it is the `config.toml`
`[skills]` table (`bundled`, `include_instructions`, `max_context_tokens`, and
`[[skills.config]]` entries of `{name | path, enabled}`), not a list, and a
role's copy is applied subtractively: only `enabled = false` entries,
`bundled.enabled = false` and `include_instructions = false` reach the child.
Preloading adds a skill's content to the child's context; that needs a writer
that injects it, and a role file has none. The field can only remove entries
from the child's skill catalog. `codexAgentDocument.serialize` therefore emits
no `skills`, and `src/frontmatter.ts` keeps the key claude-only.

Mapping on the shared name would not merely lose the field, it would break the
agent. A Claude-style list (`skills = ["a", "b"]`) fails to deserialize as a
struct, and Codex drops the *whole* role file, not just the key.

**Manifests as.** An agent declaring `skills: [x, y]` renders to a Codex TOML
with no `skills` key, and `claude-only-frontmatter-stripped` names `skills`
among the other Claude-only keys. The spawned child receives no skill content
from the role. Whatever skills it can see are the ones any Codex session lists
in its catalog, so an agent written to start with `x`'s procedure already in
context starts without it. The reverse mistake is louder but worse: a
hand-written Claude-style `skills` list in a Codex role file prints
`Ignoring malformed agent role definition` at startup, and the role is then
unknown to `spawn_agent`.

**Affects.** Codex leaf `agent` projection (`src/targets/codex.ts`,
`codexAgentDocument`), for every canonical agent that declares `skills:` — in
this repo the `agent-claude-fields` fixture; in a marketplace, any package
whose agents preload skills. The marketplace Markdown-procedure fallback (L-010)
registers no role at all, so the field has nowhere to land there regardless.

**Evidence.** Verified 2026-09-21 against codex-cli 0.154.0, from source and
from live runs, which agree. Source is openai/codex tag `rust-v0.154.0`, commit
`6b9826e3aa83b1a5947db50f4332cb9c65f1b340`, fetched read-only (it is not proven
that the installed binary was built from that exact commit, which is why every
source claim below was also checked live). Paths are relative to `codex-rs/`.

- `agent-roles/src/agent_role_config.rs:20-28`: a role file is a flattened
  `ConfigToml`, so `skills` is `Option<SkillsConfig>`
  (`config/src/skills_config.rs:18-60`; `SkillConfig.enabled` has no default).
  A deserialize failure is worded by `agent-roles/src/loader.rs:119-123` as
  `Ignoring malformed agent role definition: ...`, and its callers
  (`loader.rs:49-54`, `loader.rs:302-308`) then skip the whole role.
- `core/src/agent/role.rs:107-118` is the entire consumption of a role's
  `skills`. It keeps only the `[[skills.config]]` entries whose `enabled` is
  false, `bundled` only when its `enabled` is false, and `include_instructions`
  only when it is false, and it sets `max_context_tokens` to none. The result
  becomes an override only if something survived. `enabled = true` entries and
  `max_context_tokens` are therefore discarded before the child's config is
  built. The module doc (`role.rs:1-4`) says roles "may
  customize the child or reduce its capabilities, but never replace the parent
  session's authority". No code path reads a role's `skills` to inject a skill
  body, and the upstream tests that exercise a role's `skills`
  (`core/src/agent/role_tests.rs:555-619`, `core/src/session/tests.rs:5754-5841`)
  both assert disabling.

Live A/B, 2026-09-21: `codex exec` with an isolated `CODEX_HOME`, two skills
installed under it, and each role spawned through the parent's `spawn_agent`.
The child's rollout JSONL records its skills catalog, which was counted per
role. Four invocations, model `gpt-5.6-luna`, low effort. Roles sat in
`$CODEX_HOME/agents/*.toml` with no feature flag, and the parent's prompt named
each role as `spawn_agent`'s `agent_type`. Only that path was run, not a role
declared under `[agents.<name>]` `config_file` in `config.toml`, though the same
parser reads both.

This does not square with L-011, which saw no child apply a custom role and
inferred that the spawn tool has no role-selection parameter. Here `agent_type`
was accepted (an unknown name fails with `unknown agent_type`) and each child's
rollout names its role, so that inference does not hold for a prompt that passes
`agent_type` explicitly. L-011 is left as written; it needs its own retest.

| Role `skills` | Observed in the child |
| --- | --- |
| none (control) | both skills in catalog, `<skills_instructions>` block present |
| `[[skills.config]]` `name = "t129-alpha"`, `enabled = false` | alpha absent, beta present |
| `enabled = true` for alpha and beta | catalog identical to the control |
| `[skills.bundled]` `enabled = false` | bundled `skill-creator` absent, alpha present |
| `[skills]` `include_instructions = false` | `<skills_instructions>` block absent |
| `skills = ["t129-alpha", "t129-beta"]` | role rejected at startup: `failed to deserialize agent role file at .../probe_bad.toml: invalid type: string "t129-alpha", expected struct BundledSkillsConfig`; the spawn then fails with `unknown agent_type 'probe_bad'` |

The `enabled = false` row is the positive control: it proves the rollout
catalog reflects the role, so the unchanged `enabled = true` row is a real
negative and not a blind probe. The sentence that occurs only in a skill's
`SKILL.md` body (`The alpha marker string is ...`; the description carries the
marker token but not that sentence) appeared in no child rollout in any run,
including the `enabled = true` role. A role also cannot re-enable a skill the
parent's own `config.toml` disabled. `skills = "t129-alpha"` fails the same way
(`expected struct SkillsConfig`), as does a `[[skills.config]]` entry with no
`enabled` (`missing field`).

A `name` selector matches a loaded skill's name exactly; a name matching nothing
is a silent no-op (observed), and a plugin's skills are named
`<plugin>:<skill>` (source only, `ext/skills/src/loader/namespace.rs:176-181`;
no plugin was installed). There is no allowlist form: hiding everything but the
named skills would mean disabling every other installed skill, a set no compile
step holds.

**Status.** open, upstream. The mapping is withheld deliberately, not deferred:
the canonical value is a confirmed loss on Codex and is reported as one. It
moves only if Codex grows an additive form (see the revisit trigger).

**Revisit trigger.** A codex-cli release whose `core/src/agent/role.rs` stops
discarding `enabled = true` entries, or adds a role field that injects named
skills into a spawned child. Re-run the A/B above: a role naming an installed
skill must put that skill's `SKILL.md` body marker into the child's rollout,
which no run does today.

**Where to look.** `src/frontmatter.ts` — the agent `skills` row and its
`claudeOnly` citation. `src/targets/codex.ts` — `codexAgentDocument.serialize`,
which emits `name`, `description`, `model`, `model_reasoning_effort` and
`developer_instructions` and never `skills`. `tests/render.test.ts` — "reports
the Claude agent fields as a confirmed loss on Codex" asserts `skills` is among
the stripped keys. `docs/field-parity.md` — the Agent `skills` row.
