# Correctness review — fibery-120-diagnostic-codes

Scope: `jj diff -r 'main@origin..@'` (5dffa293, c68e8e60, 1f461d86, bf4d6e83)

## Result: no findings

Checked each hunted-for failure mode; none reproduced.

1. **Back door into `code` bypassing the union.** Traced every `code:` write site
   in `src/`. `ProposedCompilationDiagnostic.code: DiagnosticCode` (compiler.ts:121)
   is the only constructor path; `CompilationDiagnostic` narrows via
   `Omit<ProposedCompilationDiagnostic, 'packageId'>`, so `toReported()` in
   report.ts calls `dispositionOf(diagnostic.code)` fully typed — no `as`, no
   `string` widening, no JSON.parse re-entry. The two `code: string` fields
   (`ReportedDiagnostic`/`ReportedCheckDiagnostic` output shapes) are one-way
   output types, never read back into `dispositionOf`. `bunx tsc --noEmit` passes
   clean, which independently confirms `DISPOSITION_BY_CODE`'s totality actually
   holds (not just aspirational per comment).

2. **Non-exhaustive `Disposition` consumer.** Only `src/report.ts` touches the
   `Disposition` type (grep for other files: no hits). `DISPOSITION_LABEL` is a
   `Record<Disposition, string>` — also total, includes `nothing-to-carry`.
   `countOf`'s sparse `byDisposition` build and `dispositionTable`'s
   `Object.entries` iteration are both generic over whatever keys are present, so
   the new sixth member needs no special-casing and gets none. `DISPOSITION_ORDER`
   is exported and used consistently for sort order and range checks.

3. **`empty-hook-configuration` -> `nothing-to-carry` classification.** Read the
   emit site (`src/targets/codex-marketplace.ts:361-370`, unchanged by this diff).
   The diagnostic fires only inside `if (translatedEvents.length === 0)` **and**
   `Object.keys(source.hooks).length === 0` — i.e., only when the hook file
   declared zero events to begin with. The case where events exist but are all
   dropped (unsupported/unclassified) takes the earlier `continue` branches,
   which each emit their own `unsupported-hook-event` / `unclassified-hook-event`
   diagnostic (mapped to `lost-undeclared` / `not-established` respectively) and
   never reaches the `empty-hook-configuration` emit. So the reclassified code
   genuinely never fires when something real was dropped — the "nothing existed
   to translate" precondition holds structurally, not just by convention.

4. **Behavior changes the suite wouldn't catch.** None found beyond what's now
   covered: `tests/compilation-report.test.ts` adds a direct unit test for
   `dispositionOf('empty-hook-configuration')` and its `DISPOSITION_ORDER`
   placement (the fixture path can't exercise it, correctly noted in the test's
   own comment). `tests/compiler.test.ts`'s three replaced fake codes
   (`z-last`, `unresolved-projection`, `unexpected-package` -> real union
   members) are a mechanical consequence of closing the type, not a coverage
   loss — those tests assert compiler ordering/dedup behavior unrelated to which
   literal code string is used.

## Secondary checks (also clean)

- `WarningKind = Extract<DiagnosticCode, ...>` in `src/types.ts`: the 5 literal
  `kind:` assignments in `src/render.ts` match the Extract set exactly (verified
  by grep + tsc).
- ndr:bqh2gz and ndr:hv9kbf resolved via `ndr resolve <id> --full`: both atoms'
  actual text matches the code comments' paraphrase (totality-at-type-level
  rationale; hv9kbf's "disposition names what the compile established, not the
  construct's final fate" framing, cited verbatim in the `nothing-to-carry`
  comment, is accurate).
- `bun test`: 272 pass, 1 skip, 0 fail.

No edits made; read-only review as instructed.
