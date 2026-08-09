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

## L-001 — An unrecognized canonical frontmatter key was discarded with nothing reported

> **Amendment history.** Written 2026-08-02 as a Codex-scoped visibility gap.
> Widened 2026-08-03: the key was destroyed in the **Claude** projection too,
> for a runtime that supports it, and the defect was already **published**.
> Amended again 2026-08-03 on the fix — a second live instance surfaced, and it
> reframed the gap. Same ID throughout.
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
| Unrecognized key | retained **provisionally** | stripped | `unrecognized-frontmatter-key`, on every target including Claude |
| Declared authoring-layer key (`authoring-keys` in `PACKAGE.yaml`) | stripped | stripped | nothing — a declared strip is not a loss |

Retention on Claude is the right default for a key nobody has ruled on, **not a
verdict**: Claude is the source dialect, so an unrecognized canonical key is by
construction a Claude key not yet enumerated. Passing it through is not an
endorsement, which is why it warns on Claude too.

**Evidence.** Established 2026-08-02 during a drafting session. The findings
that escalated it, verified 2026-08-03:

1. **The Claude projection dropped it.** Canonical source at
   `plugins/compass/skills/reflect/SKILL.md` carries `disallowed-tools` with
   `WebSearch`, `WebFetch`, and `Agent`. The compiled `claude/` projection of
   that same file did not.
2. **It reached publication.**
   `~/.claude/plugins/marketplaces/jdh/plugins/compass/skills/reflect/SKILL.md`
   — the `jdh313/shared-claude-plugins` mirror that any other machine installs
   from — had no `disallowed-tools`. `reflect` and `mull`, whose entire stance
   is never-web-search and never-delegate, shipped in a form where nothing
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
`disallowed-tools` is now enumerated and listed in `CLAUDE_ONLY_KEYS`.
`src/targets/index.ts:14-22` — the `unrecognizedFrontmatter: 'retain' | 'strip'`
contract and why `retain` is Claude-only. `src/targets/claude.ts:44,51` — the
only `retain` opt-ins. `src/render.ts:145-195` — authoring-key removal first,
then the unrecognized-key split and its warning. `src/definitions.ts:134` —
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
/Users/jacob/Projects/cc-marketplace/marketplaces/codex`, all seven pilots
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
and the matching lines in `codex.ts:18`, `opencode.ts:18`, `claude-chat.ts:18` —
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

**Status.** open. The workaround in the field today is prose: `shake-tune`
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
