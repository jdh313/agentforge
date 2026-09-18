# Fibery #120 — Close the compiler diagnostic code union (ndr:bqh2gz)

## Commit

`5dffa293` — `refactor(report): close the compiler diagnostic code union`

## What changed

1. **New closed union `DiagnosticCode`** in `src/types.ts` (placed there, not
   a new module, because `types.ts` is already the repo's leaf shared-types
   module with no imports of its own — `WarningKind` already lived there, and
   `compiler.ts` already imports from it, so no cycle). Enumerates all 16
   literal codes actually minted anywhere in the codebase: the 5 former
   `WarningKind` members plus the 11 compiler-only codes found by grepping
   every `code: '...'` emit site in `compiler.ts`, `targets/codex-
   marketplace.ts`, and `targets/package-payload.ts`.
2. **`WarningKind` is now `Extract<DiagnosticCode, ...>`** over the same 5
   renderer-owned literals, not a re-declared union. `artifact-not-supported`
   is dropped — grepped every source and test file; nothing ever constructs
   `kind: 'artifact-not-supported'`, matching bqh2gz's Context note about a
   member "no code path constructs."
3. **`ProposedCompilationDiagnostic.code` / `CompilationDiagnostic.code`**
   (`src/compiler.ts`) narrowed from `string` to `DiagnosticCode`. This alone
   propagates through every emit site (`compiler.ts`, both `codex-
   marketplace.ts` and `package-payload.ts` diagnostics arrays are already
   typed via `ProposedCompilationDiagnostic[]`), so no call site needed an
   explicit annotation change.
4. **`DISPOSITION_BY_CODE`** (`src/report.ts`) retyped
   `Readonly<Record<DiagnosticCode, Disposition>>` — total, so `tsc` would
   refuse a missing entry. Confirmed by removing an entry locally and
   re-running `tsc`; it fails as expected, then restored.
5. **`dispositionOf`** narrowed to take `DiagnosticCode`. Kept the `?? 'not-
   established'` fallback per the explicit commitment in bqh2gz not to delete
   it — it is now provably unreachable for any value that type-checks as
   `DiagnosticCode`, and `tsc` does not flag it as dead code (no
   `noUncheckedIndexedAccess` in `tsconfig.json`, so `Record<K, V>[k]` types
   as `V`, not `V | undefined`; the `??` is legal TS, just semantically
   unreachable). Commented why it stays.

## The two previously-unmapped codes

- **`supplied-output-override`** (`src/compiler.ts:498`) -> `carried-form-
  changed`. It fires when an author's supplied output wins a producer
  collision against a generated/translated output at the same destination.
  Nothing is lost in the taxonomy's sense (`CONTEXT.md`'s "Loss" glossary
  entry is specifically about a *construct* whose meaning doesn't survive) —
  the destination still gets content, just from a different producer. That
  matches `carried-form-changed`'s existing members (`translated-construct`,
  `translated-hook-handler-args`, `hook-timeout-capped-by-runtime`): survives,
  form changed. I considered `lost-declared` first because the diagnostic is
  fully explicit about what happened, but rejected it — `CONTEXT.md`'s
  "Declared loss" glossary entry ties that disposition specifically to the
  author's `losses`-key acknowledgment mechanism (the `declared-loss` code),
  not to "any loss the compiler happens to report clearly." Reusing it here
  would blur that distinction rather than close the union cleanly.
- **`empty-hook-configuration`** (`src/targets/codex-marketplace.ts:367`) ->
  `lost-undeclared`. Fires when a hook configuration file declares zero
  events, so zero output is produced for Codex (`outputs: []`). Ruled out
  `carried-*` (nothing is carried — there is no output at all) and `lost-
  declared` (no author `losses` declaration is involved; the compiler is
  reactively reporting a no-op it discovered, the same shape as the other
  `lost-undeclared` members like `unsupported-hook-event` and `unsupported-
  artifact-projection`). It is a genuine loss under `CONTEXT.md`'s definition
  ("Omission" is explicitly *not* this case, since omission requires no
  diagnostic naming it, and this one names it) reported without a prior
  author declaration, so `lost-undeclared` fits directly.

Both dispositions are argued in comments left in `DISPOSITION_BY_CODE` (`src/
report.ts`), citing ndr:bqh2gz.

## Test changes (plumbing only, not narrowing-driven behavior change)

`tests/compiler.test.ts` used four fabricated codes (`'z-last'`,
`'unresolved-projection'` x2, `'unexpected-package'`) purely to exercise
diagnostic sort order and provenance-enrollment rejection — none of that
logic is code-value-sensitive (sort key is `provenance` first, `code` second,
`message` third, and the tests' sort assertions are driven by differing
`packageId`s, not by the fabricated codes). Swapped them for real
`DiagnosticCode` members (`'unclassified-construct'`, `'unsupported-artifact-
projection'`) that type-check under the new closed union; one substitution
(`'unresolved-projection'` -> `'unsupported-artifact-projection'`) also
happens to match its test's existing message text
("No Claude projection exists for agent artifacts; source retained.") almost
verbatim to the real emit site's wording, so it reads naturally.

No test exercising `dispositionOf`'s unmapped-code fallback existed before
this change (grepped `dispositionOf(` — only its declaration and its one call
site in `report.ts` matched), so nothing needed deleting there.

## Verification (this session)

- `bunx tsc --noEmit` — clean, no output.
- `bun test` — `271 pass, 1 skip, 0 fail, 112 snapshots, 872 expect() calls`
  across 272 tests / 23 files. **No `--update-snapshots` was needed** — output
  content is unchanged, confirming this landed as a type-level change only,
  as required.
- `bunx biome check .` — `Checked 69 files in 35ms. No fixes applied. Found 1
  info.` The one info is a pre-existing `$schema` version mismatch in
  `biome.json` (2.5.8 pinned vs. CLI 2.4.14 installed), unrelated to this
  change and not touched.

## Left behind / nothing outstanding

- No snapshot regeneration was needed or performed.
- No scope creep: `check.ts`/`install.ts`'s `MarketplaceCheckIssue` codes and
  `definitions.ts`'s `code: 'custom'` zod-issue codes were left untouched, per
  bqh2gz's Scope.
- The `hv9kbf`-provisional comment on `construct-unresolved-at-install-scope`
  was preserved verbatim rather than touched, since that disposition
  assignment was already correct and out of this task's scope.

---

## Follow-up: add `nothing-to-carry` disposition (ndr:bqh2gz, ndr:71jgk2)

Commit: `8eb1d157` (build on `5dffa293`).

### Member and why

Added `nothing-to-carry` as `Disposition`'s sixth member. `empty-hook-configuration`
fires only when `Object.keys(source.hooks).length === 0` — the hook file declared
zero events, so nothing existed for the compile to lose or to carry. Filing that
as `lost-undeclared` (as I did in the first pass) asserted a loss that never
occurred, and `lost-undeclared` sorts first in `DISPOSITION_ORDER`, so a no-op
would have led every disposition-grouped scan alongside real confirmed losses.
Kept the name the dispatch proposed — it reads correctly against the code's own
condition (nothing to carry into output).

### Scale position and argument

`DISPOSITION_ORDER`: `lost-undeclared`, `lost-declared`, `carried-form-changed`,
`carried-unenforced`, **`nothing-to-carry`**, `not-established`. Comments at both
the `Disposition` union declaration and `DISPOSITION_ORDER` (src/report.ts) carry
the argument: per ndr:hv9kbf's framing that "a disposition does not name a
construct's final fate; it names what the compile established about it," a no-op
is fully established (the compile knows exactly what happened: nothing), so it
cannot sit beside `not-established`, which is reserved for genuine unknowns. It
also cannot lead or sit among the loss states, since nothing was lost. That
leaves the position directly after the carried states and before
`not-established` — which is also where ndr:hv9kbf's still-unbuilt gated member
wants to land. I did not implement hv9kbf's member (out of scope, tentative,
unbuilt) and left an explicit comment at both the `construct-unresolved-at-
install-scope` provisional note and the `DISPOSITION_ORDER` comment that the
relative order between `nothing-to-carry` and hv9kbf's eventual member is
undecided, for that work to resolve deliberately.

### Remap

`empty-hook-configuration`: `lost-undeclared` -> `nothing-to-carry`.
`supplied-output-override` untouched (`carried-form-changed`, unchanged).

### Consumers updated

Grepped every reference to `Disposition` in `src/report.ts` and `tests/`:

- `Disposition` union (src/report.ts) — added the member.
- `DISPOSITION_BY_CODE` (`Record<DiagnosticCode, Disposition>`, total) —
  remapped `empty-hook-configuration`; `tsc` would have refused a missing
  DiagnosticCode key regardless, so this one was type-enforced too.
- `DISPOSITION_ORDER` (plain `readonly Disposition[]`, **not** type-enforced
  for completeness) — manually inserted; this is the one place a member could
  have silently gone missing from grouped/table output (`countOf`'s
  `byDisposition` is built by filtering `DISPOSITION_ORDER`, so an
  un-added member's diagnostics would simply vanish from every count and
  table rather than erroring).
- `DISPOSITION_LABEL` (`Record<Disposition, string>`, total) — added the
  label; `tsc` enforced this one.
- `dispositionTable` / `countOf` / `renderMarkdown` — no changes needed, they
  all read through `DISPOSITION_ORDER`/`DISPOSITION_LABEL` rather than
  enumerating `Disposition` themselves.
- `SCOPE_NOTICE` — read it; makes no claim about the disposition set or count,
  left unchanged.
- `tests/compilation-report.test.ts`'s `EXPECTED_DISPOSITION_ORDER` /
  `EXPECTED_COUNTS_BY_DISPOSITION` — left unchanged; its fixture
  (`codex-hook-projection`) never emits `empty-hook-configuration` or
  `supplied-output-override`, confirmed by grepping the fixture's diagnostic
  codes against `EXPECTED_COUNTS_BY_CODE`, so those constants stay accurate
  without edits.

### Snapshot diff review

`bun test` (no update flag) — **271 pass, 1 skip, 0 fail**, before touching
snapshots at all: the committed snapshots already matched byte-for-byte.
Grepped `tests/__snapshots__/` for `empty-hook-configuration` and
`"nothing to carry"` beforehand — zero matches — confirming no committed
snapshot encodes a disposition/report view of that code, so this remap had no
snapshot surface to move.

Then ran `bun test --update-snapshots` anyway per instruction: **271 pass, 1
skip, 0 fail**, `snapshots: 1 passed, 111 added`. `jj status`/`jj diff --stat`
immediately after show **zero changes to any file under `tests/__snapshots__/`**
— only `src/report.ts` and this report file are modified. Bun's own
"111 added" line describes its internal snapshot bookkeeping for that run, not
a content change; jj (which diffs actual bytes) confirms no snapshot file
moved. **Finding: 0 snapshots moved, and that is the expected outcome** given
no fixture exercises either newly-classified code through the report path.

### Verification (verbatim)

`bunx tsc --noEmit`:
```
(no output)
```

`bun test`:
```
bun test v1.4.2 (744846f84)

 271 pass
 1 skip
 0 fail
 112 snapshots, 872 expect() calls
Ran 272 tests across 23 files. [5.10s]
```

`bun test --update-snapshots`:
```
bun test v1.4.2 (744846f84)

 271 pass
 1 skip
 0 fail
snapshots: 1 passed, 111 added
 872 expect() calls
Ran 272 tests across 23 files. [5.06s]
```
(No `tests/__snapshots__/*` files appear in `jj diff` after this run.)

`bunx biome check .`:
```
biome.json:2:14 deserialize (info) — $schema 2.5.8 pinned vs CLI 2.4.14 installed,
pre-existing, unrelated to this change.

Checked 69 files in 43ms. No fixes applied.
Found 1 info.
```

### Left behind / nothing outstanding

- No ndr atom written or amended (team lead is capturing it separately).
- `check.ts`/`install.ts` codes and the report's grouping axis untouched.
- Nothing else needed remapping; `supplied-output-override` is unaffected by
  this follow-up.
