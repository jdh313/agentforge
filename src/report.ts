import { dirname } from 'node:path';
import type { CompilationDiagnostic, CompilationPlan } from './compiler.ts';
import { portableRelativePath } from './definitions.ts';

// Bump when the JSON shape changes in a way a parser would notice. An
// unversioned machine format turns the first shape change into a silent
// breakage for anyone reading it in CI.
const SCHEMA_VERSION = 1;

// The report's own scope limit, stated in the report rather than assumed. It is
// built from `plan.diagnostics`, so it records translation and says nothing
// about omission — and a report that looks complete while omitting a whole
// category is worse than no report (docs/limitations.md L-007).
const SCOPE_NOTICE =
  'Scope: this report is built from the compiler diagnostics, so it records what survived translation and what was lost in it. It does not record omission — a source file or declaration absent from output with no diagnostic naming it. See docs/limitations.md L-007.';

export type ReportFormat = 'json' | 'md';

export interface ReportedDiagnostic {
  code: string;
  severity: 'note' | 'warning';
  message: string;
  target: string;
  publicationId: string;
  packageId?: string;
  retainedSource?: { artifactType: string; sourcePath: string };
}

export interface ReportCounts {
  total: number;
  bySeverity: Record<string, number>;
  byCode: Record<string, number>;
}

export interface ReportGroup {
  counts: ReportCounts;
  diagnostics: ReportedDiagnostic[];
}

export interface CompilationReport {
  schemaVersion: number;
  marketplaceId: string;
  scope: string;
  counts: ReportCounts;
  packages: Record<string, ReportGroup>;
  // Diagnostics with no `packageId` — publication-level rather than
  // package-level. A sibling key rather than a synthetic package name, which
  // could collide with a real package id (companion decision row 9).
  publication?: ReportGroup;
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

  const packages: Record<string, ReportGroup> = {};
  const unscoped: ReportedDiagnostic[] = [];
  for (const diagnostic of reported) {
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
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    marketplaceId: plan.marketplaceId,
    scope: SCOPE_NOTICE,
    counts: countOf(reported),
    packages: sortKeys(packages),
    ...(unscoped.length === 0
      ? {}
      : { publication: { counts: countOf(unscoped), diagnostics: unscoped } }),
  };
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
  };
}

function emptyCounts(): ReportCounts {
  return { total: 0, bySeverity: {}, byCode: {} };
}

function countOf(diagnostics: readonly ReportedDiagnostic[]): ReportCounts {
  const bySeverity: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  for (const { severity, code } of diagnostics) {
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  return { total: diagnostics.length, bySeverity: sortKeys(bySeverity), byCode: sortKeys(byCode) };
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

// Warnings before notes within a group: a loss is what a reader is scanning
// for, and a note sitting above it is what the flat terminal stream already
// gets wrong.
const SEVERITY_ORDER: readonly ('warning' | 'note')[] = ['warning', 'note'];

function renderMarkdown(report: CompilationReport): string {
  const lines: string[] = [
    `# Compilation report — ${report.marketplaceId}`,
    '',
    `> ${report.scope}`,
    '',
    ...countsTable(report.counts),
    '',
  ];

  for (const [packageId, group] of Object.entries(report.packages)) {
    lines.push(...groupSection(`Package: ${packageId}`, group));
  }
  if (report.publication) {
    lines.push(...groupSection('Publication-level (no package)', report.publication));
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function countsTable(counts: ReportCounts): string[] {
  const rows = [
    ...SEVERITY_ORDER.filter((severity) => counts.bySeverity[severity] !== undefined).map(
      (severity) => `| ${severity} | ${counts.bySeverity[severity]} |`,
    ),
    ...Object.entries(counts.byCode).map(([code, count]) => `| \`${code}\` | ${count} |`),
  ];
  return ['| Category | Count |', '| --- | --- |', `| **total** | ${counts.total} |`, ...rows];
}

function groupSection(heading: string, group: ReportGroup): string[] {
  const lines = [`## ${heading}`, '', ...countsTable(group.counts), ''];
  for (const severity of SEVERITY_ORDER) {
    const matching = group.diagnostics.filter((diagnostic) => diagnostic.severity === severity);
    if (matching.length === 0) continue;
    lines.push(`### ${severity} (${matching.length})`, '');
    for (const diagnostic of matching) {
      const source = diagnostic.retainedSource
        ? ` — \`${diagnostic.retainedSource.sourcePath}\` (${diagnostic.retainedSource.artifactType})`
        : '';
      lines.push(
        `- **\`${diagnostic.code}\`** [${diagnostic.target}]${source}`,
        `  ${diagnostic.message}`,
      );
    }
    lines.push('');
  }
  return lines;
}
