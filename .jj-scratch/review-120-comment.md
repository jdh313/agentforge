# Comment accuracy review — fibery-120-diagnostic-codes

Scope: `jj diff -r 'main@origin..@'` (commits 5dffa293, c68e8e60, 1f461d86, bf4d6e83).

## Findings

None. No stale-comment or inaccurate-citation issues found.

## Checks performed

- `src/report.ts` `dispositionOf` comment rewrite (unchanged-by-narrowing case):
  verified `DISPOSITION_BY_CODE` is `Record<DiagnosticCode, Disposition>` and
  `bunx tsc --noEmit` passes clean, confirming the "total over the union, fails
  the build" claim and the "`??` branch is provably dead" claim.
- ndr citations resolved via `ndr resolve <id> --full` and cross-checked against
  the comments citing them:
  - `bqh2gz` (src/types.ts:22-27, src/report.ts multiple) — decision text matches
    claims: total mapping, renderer vocabulary as `Extract` subset, one call site
    assigning `warning.kind` into `code` (verified at `src/artifact-plan.ts:117`,
    matches bqh2gz's Context bullet "assigned into the code field verbatim at one
    call site").
  - `hv9kbf` (src/report.ts:33-39, :78-84) — quote "a disposition does not name a
    construct's final fate; it names what the compile established about it" is
    verbatim from the atom's Why section. Placement claim (between carried states
    and not-established, still undecided relative to `nothing-to-carry`) matches
    the atom's tentative conviction and open Context.
  - `71jgk2` (src/report.ts:92-100) — "a scale, not an alphabet" and disposition
    ordering claims match the atom's Commitments ("must not be alphabetized; the
    order is the scale").
  - `szdn5s` (src/report.ts:112, pre-existing, unchanged by this branch) —
    consistent with the atom's theme (never assert a disposition/loss without
    established certainty); not a new claim introduced by this diff.
- `artifact-not-supported` removed from `WarningKind`/new `DiagnosticCode`: confirmed
  dead — no references anywhere in `src/` or `tests/` (grep clean), so removal is
  not a silent behavior change requiring a comment update elsewhere.
- Test comment at `tests/compilation-report.test.ts:265-268` citing
  `src/report.ts:306-314` for `countOf`'s sparse `byDisposition` construction —
  line range and behavior verified accurate.
- Test comment attributing `nothing-to-carry` to commit `c68e8e60` — confirmed via
  `jj log`: c68e8e60 is exactly "refactor(report): add nothing-to-carry
  disposition for hook no-ops".
- Swept `src/*.ts` and `src/targets/*.ts` for other comments describing `code` as
  an open string / unmapped-code-as-fallback outside `report.ts`/`types.ts`; the
  only other `.code` usages found are `MarketplaceCheckIssue`/check-issue codes
  (`check.ts`, `cli.ts`, `install.ts`, `artifact-plan.ts`), which bqh2gz's Scope
  section explicitly excludes ("Does not bind: check issue codes, which are a
  separate space") — no stale comments there.
