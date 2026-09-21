import { dirname } from 'node:path';
import type { MarketplaceCheckIssue, MarketplaceCheckResult } from './check.ts';
import type { CompilationDiagnostic, CompilationPlan } from './compiler.ts';
import { portableRelativePath } from './definitions.ts';
import { rootDisplayPath } from './root-manifest.ts';
import type { DiagnosticCode } from './types.ts';

// Bump when the JSON shape changes in a way a parser would notice. An
// unversioned machine format turns the first shape change into a silent
// breakage for anyone reading it in CI.
const SCHEMA_VERSION = 2;

// The report's own scope limit, stated in the report rather than assumed. It is
// built from `plan.diagnostics`, so it records translation and says nothing
// about omission — and a report that looks complete while omitting a whole
// category is worse than no report (docs/limitations.md L-007).
const SCOPE_NOTICE =
  'Scope: this report is built from the compiler diagnostics, so it records what survived translation and what was lost in it. It does not record omission — a source file or declaration absent from output with no diagnostic naming it. See docs/limitations.md L-007.';

export type ReportFormat = 'json' | 'md';

// What actually became of the thing, which is the question a reader brings to a
// report. Severity does not answer it: `declared-loss` is a note and is a real
// loss, while `translated-construct` is also a note and is not one, so grouping
// by severity files a confirmed loss beside a non-loss. Disposition is derived
// from the code rather than stored on the diagnostic, so the compiler stays
// unaware a report exists — same as counts.
export type Disposition =
  | 'lost-undeclared'
  | 'lost-declared'
  | 'carried-form-changed'
  | 'carried-unenforced'
  // Nothing existed to carry or lose: the compile fully established that a
  // construct's fate was a no-op, not that a construct's fate is unknown.
  // ndr:q3b191: a disposition names what the compile established rather than
  // what a construct suffered — a no-op is as established
  // as a loss is, so it cannot sit in the leading loss states (nothing was
  // lost) nor in `not-established` (nothing is unknown here). See its position
  // in `DISPOSITION_ORDER` below for the placement argument (ndr:bqh2gz).
  | 'nothing-to-carry'
  // The condition is known and actionable, but its outcome is not established.
  // A settled no-op therefore precedes it and a wholly unknown result follows
  // it on the report scale (ndr:7r7n44).
  | 'gated'
  | 'not-established';

// Total over `DiagnosticCode` (ndr:bqh2gz): the type checker refuses to
// compile this object literal unless every member of the union has an entry,
// so a code minted without a disposition fails the build instead of drifting
// in unclassified until someone notices.
const DISPOSITION_BY_CODE: Readonly<Record<DiagnosticCode, Disposition>> = {
  'claude-only-frontmatter-stripped': 'lost-undeclared',
  'claude-only-body-feature': 'lost-undeclared',
  'unsupported-artifact-projection': 'lost-undeclared',
  'unsupported-hook-event': 'lost-undeclared',
  'declared-loss': 'lost-declared',
  'translated-construct': 'carried-form-changed',
  'translated-hook-handler-args': 'carried-form-changed',
  'hook-timeout-capped-by-runtime': 'carried-form-changed',
  'artifact-hook-scope-widened': 'carried-unenforced',
  'unsupported-artifact-hook-once': 'lost-undeclared',
  // A supplied payload winning a producer collision (`supplied-output-override`,
  // src/compiler.ts) carries the destination through in changed form: content
  // still lands there, just from the supplied producer instead of the
  // generated/translated one it replaced. Nothing is lost — the note exists to
  // say which producer's bytes are at that destination now (ndr:bqh2gz).
  'supplied-output-override': 'carried-form-changed',
  'inferred-artifact-projection': 'carried-unenforced',
  'construct-support-gated': 'gated',
  // A hook configuration that declares zero events yields zero Codex output
  // (`empty-hook-configuration`, src/targets/codex-marketplace.ts) — a fully
  // established no-op, not a loss (nothing existed to lose) and not carried
  // (there is no output). See `nothing-to-carry` above (ndr:bqh2gz).
  'empty-hook-configuration': 'nothing-to-carry',
  'unclassified-construct': 'not-established',
  'unclassified-body-construct': 'not-established',
  'unrecognized-frontmatter-key': 'not-established',
  'unclassified-hook-event': 'not-established',
};

// Order the reader scans in: confirmed losses first, unknowns last — a scale,
// not an alphabet (ndr:71jgk2). Settled non-losses precede conditional
// outcomes, and a named condition precedes a wholly unestablished result
// (ndr:7r7n44).
export const DISPOSITION_ORDER: readonly Disposition[] = [
  'lost-undeclared',
  'lost-declared',
  'carried-form-changed',
  'carried-unenforced',
  'nothing-to-carry',
  'gated',
  'not-established',
];

// An unmapped code resolves here rather than to a loss or a non-loss. Claiming
// either would be the same mistake severity-grouping made: asserting a
// disposition the table has not established (ndr:szdn5s). `DISPOSITION_BY_CODE`
// is now total over `DiagnosticCode` (ndr:bqh2gz), so for any value that
// actually type-checks as a `DiagnosticCode` this lookup never falls through —
// the `??` branch is provably dead. It stays in source anyway, unreachable, as
// the statement of intent ndr:bqh2gz commits to keeping: deleting it would
// assert a disposition table nothing has actually verified stays total forever
// against a `code` read back from outside the type system (e.g. a persisted
// report re-parsed as `string`).
export function dispositionOf(code: DiagnosticCode): Disposition {
  return DISPOSITION_BY_CODE[code] ?? 'not-established';
}

// A source location as a report renders it: the path relative to the
// marketplace root, so two contributors' reports diff cleanly (ndr:c5snzf).
export interface ReportedSourceLocation {
  path: string;
  line?: number;
}

export interface ReportedDiagnostic {
  code: string;
  disposition: Disposition;
  severity: 'note' | 'warning';
  message: string;
  target: string;
  publicationId: string;
  packageId?: string;
  retainedSource?: { artifactType: string; sourcePath: string };
  // Where in source this diagnostic is about, carried as data so a consumer can
  // jump rather than parse the sentence in `message`. Omitted when the compiler
  // established none.
  locations?: ReportedSourceLocation[];
}

export interface ReportCounts {
  total: number;
  byDisposition: Record<string, number>;
  bySeverity: Record<string, number>;
  byCode: Record<string, number>;
}

export interface ReportGroup {
  counts: ReportCounts;
  diagnostics: ReportedDiagnostic[];
}

export interface ReportTarget {
  counts: ReportCounts;
  packages: Record<string, ReportGroup>;
  // Diagnostics with no `packageId` — publication-level rather than
  // package-level. A sibling key rather than a synthetic package name, which
  // could collide with a real package id (companion decision row 9).
  publication?: ReportGroup;
}

export interface CompilationReport {
  schemaVersion: number;
  marketplaceId: string;
  scope: string;
  // Marketplace-root-anchored manifests written by `root-manifest`
  // publications. Listed separately from everything else because they are the
  // only outputs that do not live under `--out`, and a reader scanning the
  // report for what was written would otherwise never see them. Omitted
  // entirely when no publication declares one.
  rootManifests?: string[];
  counts: ReportCounts;
  // Keyed by target even while only one reports today: which target lost what
  // is the question, and a single-key map says that plainly where a flat one
  // would imply the distinction does not exist.
  targets: Record<string, ReportTarget>;
}

export function formatFromPath(path: string): ReportFormat | undefined {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'md';
  return undefined;
}

export function renderReport(plan: CompilationPlan, format: ReportFormat): string {
  const report = buildReport(plan);
  return format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
}

export function buildReport(plan: CompilationPlan): CompilationReport {
  // Every diagnostic in one plan shares a marketplace, so the root is taken
  // once rather than per row.
  const root = marketplaceRoot(plan);
  const reported = plan.diagnostics.map((diagnostic) => toReported(diagnostic, root));

  const byTarget = new Map<string, ReportedDiagnostic[]>();
  for (const diagnostic of reported) {
    const bucket = byTarget.get(diagnostic.target);
    if (bucket) bucket.push(diagnostic);
    else byTarget.set(diagnostic.target, [diagnostic]);
  }

  const targets: Record<string, ReportTarget> = {};
  for (const [target, diagnostics] of byTarget) {
    targets[target] = buildTarget(diagnostics);
  }

  const rootManifests = plan.rootOutputs
    .map(({ destination }) => rootDisplayPath(destination))
    .toSorted(compare);

  return {
    schemaVersion: SCHEMA_VERSION,
    marketplaceId: plan.marketplaceId,
    scope: SCOPE_NOTICE,
    ...(rootManifests.length === 0 ? {} : { rootManifests }),
    counts: countOf(reported),
    targets: sortKeys(targets),
  };
}

function buildTarget(diagnostics: readonly ReportedDiagnostic[]): ReportTarget {
  const packages: Record<string, ReportGroup> = {};
  const unscoped: ReportedDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.packageId === undefined) {
      unscoped.push(diagnostic);
      continue;
    }
    const existing = packages[diagnostic.packageId];
    const group = existing ?? { counts: emptyCounts(), diagnostics: [] };
    if (!existing) packages[diagnostic.packageId] = group;
    group.diagnostics.push(diagnostic);
  }

  for (const group of Object.values(packages)) {
    group.counts = countOf(group.diagnostics);
    // Within a package the reader wants one source file at a time, worst
    // disposition first — not the compiler's emission order.
    group.diagnostics.sort(bySourceThenDisposition);
  }

  return {
    counts: countOf(diagnostics),
    packages: sortKeys(packages),
    ...(unscoped.length === 0
      ? {}
      : { publication: { counts: countOf(unscoped), diagnostics: unscoped } }),
  };
}

function bySourceThenDisposition(left: ReportedDiagnostic, right: ReportedDiagnostic): number {
  const bySource = compare(sourceOf(left), sourceOf(right));
  if (bySource !== 0) return bySource;
  return DISPOSITION_ORDER.indexOf(left.disposition) - DISPOSITION_ORDER.indexOf(right.disposition);
}

// The file a diagnostic is filed under. A retained source names one directly;
// failing that, the first established location does. Before locations existed,
// a diagnostic that named its file only in prose fell through to the
// `(no source file)` bucket even though the compiler knew exactly where it was.
function sourceOf(diagnostic: ReportedDiagnostic): string {
  return diagnostic.retainedSource?.sourcePath ?? diagnostic.locations?.[0]?.path ?? '';
}

function marketplaceRoot(plan: CompilationPlan): string {
  const first = plan.diagnostics[0];
  // `marketplacePath` points at the MARKETPLACE.yaml file; source paths are
  // relative to the directory holding it.
  return first ? dirname(first.provenance.marketplacePath) : '';
}

function toReported(diagnostic: CompilationDiagnostic, root: string): ReportedDiagnostic {
  return {
    code: diagnostic.code,
    disposition: dispositionOf(diagnostic.code),
    severity: diagnostic.severity,
    message: diagnostic.message,
    target: diagnostic.target,
    publicationId: diagnostic.provenance.publicationId,
    ...(diagnostic.provenance.packageId === undefined
      ? {}
      : { packageId: diagnostic.provenance.packageId }),
    ...(diagnostic.retainedSource === undefined
      ? {}
      : {
          retainedSource: {
            artifactType: diagnostic.retainedSource.artifactType,
            sourcePath: portableRelativePath(root, diagnostic.retainedSource.sourcePath),
          },
        }),
    ...(diagnostic.locations === undefined || diagnostic.locations.length === 0
      ? {}
      : {
          locations: diagnostic.locations.map(({ path, line }) => ({
            path: portableRelativePath(root, path),
            ...(line === undefined ? {} : { line }),
          })),
        }),
  };
}

function emptyCounts(): ReportCounts {
  return { total: 0, byDisposition: {}, bySeverity: {}, byCode: {} };
}

function countOf(diagnostics: readonly ReportedDiagnostic[]): ReportCounts {
  const byDisposition: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  for (const { disposition, severity, code } of diagnostics) {
    byDisposition[disposition] = (byDisposition[disposition] ?? 0) + 1;
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  // Disposition keeps its declared order — it is a scale from confirmed loss to
  // unknown, and alphabetizing it would scramble that into nonsense.
  return {
    total: diagnostics.length,
    byDisposition: Object.fromEntries(
      DISPOSITION_ORDER.filter((key) => byDisposition[key] !== undefined).map((key) => [
        key,
        byDisposition[key] as number,
      ]),
    ),
    bySeverity: sortKeys(bySeverity),
    byCode: sortKeys(byCode),
  };
}

// Deterministic key order so two compiles of unchanged input produce
// byte-identical reports and a diff shows only real change.
function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).toSorted(([left], [right]) => compare(left, right)),
  );
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

const DISPOSITION_LABEL: Readonly<Record<Disposition, string>> = {
  'lost-undeclared': 'lost, undeclared',
  'lost-declared': 'lost, declared',
  'carried-form-changed': 'carried, form changed',
  'carried-unenforced': 'carried, unenforced',
  'nothing-to-carry': 'nothing to carry',
  gated: 'gated by condition',
  'not-established': 'not established',
};

function renderMarkdown(report: CompilationReport): string {
  const lines: string[] = [
    `# Compilation report — ${report.marketplaceId}`,
    '',
    `> ${report.scope}`,
    '',
    ...(report.rootManifests
      ? [
          `Root manifests (relative to the marketplace root): ${report.rootManifests
            .map((path) => `\`${path}\``)
            .join(', ')}`,
          '',
        ]
      : []),
    ...dispositionTable(report.counts),
    '',
  ];

  for (const [target, targetReport] of Object.entries(report.targets)) {
    lines.push(`## Target: ${target}`, '', ...dispositionTable(targetReport.counts), '');
    for (const [packageId, group] of Object.entries(targetReport.packages)) {
      lines.push(...groupSection(`${target} / ${packageId}`, group));
    }
    if (targetReport.publication) {
      lines.push(...groupSection(`${target} / (no package)`, targetReport.publication));
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

// Disposition leads, because "what became of it" is the question. Severity and
// per-code totals stay available underneath rather than being dropped.
function dispositionTable(counts: ReportCounts): string[] {
  const rows = Object.entries(counts.byDisposition).map(
    ([key, count]) => `| ${DISPOSITION_LABEL[key as Disposition] ?? key} | ${count} |`,
  );
  return [
    '| Disposition | Count |',
    '| --- | --- |',
    ...rows,
    `| **total** | ${counts.total} |`,
    '',
    `<sub>by severity: ${formatInline(counts.bySeverity)} · by code: ${formatInline(counts.byCode)}</sub>`,
  ];
}

function formatLocation({ path, line }: ReportedSourceLocation): string {
  return line === undefined ? `\`${path}\`` : `\`${path}:${line}\``;
}

function formatInline(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
}

// One section per package, diagnostics already ordered by source file then
// disposition, with a subheading per file so a reader can answer "what did this
// file lose?" without reading the whole section.
function groupSection(heading: string, group: ReportGroup): string[] {
  const lines = [`### ${heading}`, '', ...dispositionTable(group.counts), ''];

  let currentSource: string | undefined;
  for (const diagnostic of group.diagnostics) {
    const source = sourceOf(diagnostic) || '(no source file)';
    if (source !== currentSource) {
      currentSource = source;
      lines.push(`#### \`${source}\``, '');
    }
    const artifact = diagnostic.retainedSource
      ? ` (${diagnostic.retainedSource.artifactType})`
      : '';
    lines.push(
      `- **${DISPOSITION_LABEL[diagnostic.disposition]}** — \`${diagnostic.code}\`${artifact}`,
      `  ${diagnostic.message}`,
    );
    // `path:line` on its own line rather than folded into the sentence: an
    // editor and a terminal both linkify that shape, and a reader scanning for
    // where to go does not have to read the prose to find it.
    if (diagnostic.locations) {
      lines.push(`  at ${diagnostic.locations.map(formatLocation).join(', ')}`);
    }
  }
  lines.push('');
  return lines;
}

// The check report: what `check --json` emits.
//
// Kept apart from `CompilationReport` rather than folded into it. That report
// answers "what became of each construct" and groups by disposition
// (ndr:71jgk2); this one answers "is this compiled tree fit to publish", and its
// codes are already dispositional — `missing-output`, `changed-output`,
// `unsafe-output-content` each name what happened. There is no severity axis to
// reorganise, so imposing the disposition grouping would add a layer that
// classifies nothing.
//
// It carries `schemaVersion` because it is a machine-targeted format, which is
// exactly what ndr:r51yhr binds.
const CHECK_SCHEMA_VERSION = 1;

export interface CheckReportPublication {
  id: string;
  status: 'ok' | 'failed';
  // Managed files compared against the plan, including any root-anchored
  // manifest this publication owns.
  filesChecked: number;
}

export interface CheckReport {
  schemaVersion: number;
  marketplaceId: string;
  // `ok` only when no publication failed. Hoisted so a consumer can branch
  // without walking the issue list, and so an empty `issues` array is never the
  // only signal — a reader who mistakes "no issues parsed" for "passed" is the
  // failure mode the text format already had.
  status: 'ok' | 'failed';
  publications: CheckReportPublication[];
  issues: MarketplaceCheckIssue[];
  diagnostics: ReportedCheckDiagnostic[];
}

export interface ReportedCheckDiagnostic {
  code: string;
  severity: CompilationDiagnostic['severity'];
  target: string;
  publicationId: string;
  packageId?: string;
  message: string;
  // Same data as the compilation report's, relativized the same way. A check
  // consumer reads the same diagnostics and has the same reason to jump.
  locations?: ReportedSourceLocation[];
}

export function buildCheckReport(
  plan: CompilationPlan,
  result: MarketplaceCheckResult,
): CheckReport {
  const failed = new Set(result.issues.map(({ publicationId }) => publicationId));
  const publicationIds = new Set<string>([
    ...plan.outputs.map(({ provenance }) => provenance.publicationId),
    ...plan.rootOutputs.map(({ provenance }) => provenance.publicationId),
  ]);

  const publications = [...publicationIds].toSorted(compareReportStrings).map((id) => ({
    id,
    status: (failed.has(id) ? 'failed' : 'ok') as 'ok' | 'failed',
    filesChecked:
      result.filesChecked.filter((path) => path.startsWith(`${id}/`)).length +
      result.rootFilesChecked.filter(({ publicationId }) => publicationId === id).length,
  }));

  const root = marketplaceRoot(plan);

  return {
    schemaVersion: CHECK_SCHEMA_VERSION,
    marketplaceId: plan.marketplaceId,
    status: result.issues.length > 0 ? 'failed' : 'ok',
    publications,
    // Already ordered by path then code in `checkMarketplace`, and left that
    // way: a stable order is what makes two runs diffable.
    issues: result.issues,
    diagnostics: plan.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      target: diagnostic.target,
      publicationId: diagnostic.provenance.publicationId,
      ...(diagnostic.provenance.packageId === undefined
        ? {}
        : { packageId: diagnostic.provenance.packageId }),
      message: diagnostic.message,
      ...(diagnostic.locations === undefined || diagnostic.locations.length === 0
        ? {}
        : {
            locations: diagnostic.locations.map(({ path, line }) => ({
              path: portableRelativePath(root, path),
              ...(line === undefined ? {} : { line }),
            })),
          }),
    })),
  };
}

function compareReportStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
