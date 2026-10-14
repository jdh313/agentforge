import { lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkCompilationSnapshot } from './check.ts';
import { type CompilationPlan, compileMarketplace } from './compiler.ts';
import {
  type LoadedMarketplace,
  type LoadedPackage,
  loadPackageDefinition,
} from './definitions.ts';
import { materializeCompilation, validateCompilationSources } from './materializer.ts';
import { compilePackage, materializePackage, validatePackageOutput } from './package-compiler.ts';
import {
  assertRealPath,
  physicalPath,
  publicationPathsOverlap,
  repositoryPath,
} from './publication-paths.ts';
import { buildCheckReport, type CheckReport } from './report.ts';
import {
  type LoadedRepositoryDefinition,
  loadRepositoryDefinition,
  type RepositoryPublication,
} from './repository-definition.ts';
import { buildRootManifestOutput } from './root-manifest.ts';
import { allTargets, getTarget } from './targets/index.ts';

export interface RepositoryIssue {
  code:
    | 'invalid-definition'
    | 'planning-failed'
    | 'unsafe-path'
    | 'output-collision'
    | 'publication-failed'
    | 'check-failed';
  publicationId?: string;
  source?: string;
  message: string;
}
export interface PlannedPublication {
  definition: RepositoryPublication;
  outputRoot: string;
  plan?: CompilationPlan;
}
export interface RepositoryPlan {
  loaded: LoadedRepositoryDefinition;
  publications: PlannedPublication[];
  issues: RepositoryIssue[];
}
export interface RepositoryPublicationResult {
  id: string;
  target: RepositoryPublication['target'];
  out: string;
  status: 'ok' | 'failed' | 'published' | 'not-attempted';
  report?: CheckReport;
}
export interface RepositoryReport {
  schemaVersion: 1;
  repositoryId?: string;
  config: string;
  status: 'ok' | 'failed';
  errors: RepositoryIssue[];
  publications: RepositoryPublicationResult[];
}
const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
const compareIds = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Load and plan the entire repository without creating staging/output/report files. */
export async function planRepository(path: string): Promise<RepositoryPlan> {
  const loaded = loadRepositoryDefinition(path);
  const { root, definition } = loaded;
  const issues: RepositoryIssue[] = [];
  const packages = new Map<string, LoadedPackage>();
  const ambiguousIds = new Set<string>();
  // The config is source too: a root-manifest destination must never replace it.
  const sources = new Set<string>([loaded.path]);
  const sourcePaths = new Set<string>();
  for (const source of definition.packages) {
    try {
      const absolute = repositoryPath(root, source);
      sources.add(dirname(absolute));
      if (sourcePaths.has(physicalPath(absolute)))
        throw new Error(`duplicate package source: ${source}`);
      sourcePaths.add(physicalPath(absolute));
      const pkg = await loadPackageDefinition(absolute);
      const id = pkg.definition.id;
      if (packages.has(id) || ambiguousIds.has(id)) {
        packages.delete(id);
        ambiguousIds.add(id);
        throw new Error(`duplicate package id: ${id}`);
      }
      packages.set(id, pkg);
    } catch (cause) {
      issues.push({ code: 'invalid-definition', source, message: message(cause) });
    }
  }

  const publications: PlannedPublication[] = [];
  for (const publication of definition.publications.toSorted(compareIds)) {
    let outputRoot: string;
    try {
      outputRoot = repositoryPath(root, publication.out);
      const entry = lstatSync(outputRoot, { throwIfNoEntry: false });
      if (entry && !entry.isDirectory())
        throw new Error(`snapshot output must be a directory: ${outputRoot}`);
    } catch (cause) {
      issues.push({ code: 'unsafe-path', publicationId: publication.id, message: message(cause) });
      publications.push({ definition: publication, outputRoot: resolve(root, publication.out) });
      continue;
    }
    const planned: PlannedPublication = { definition: publication, outputRoot };
    publications.push(planned);
    try {
      let plan: CompilationPlan;
      if (publication.kind === 'package') {
        const pkg = packages.get(publication.package);
        if (!pkg)
          throw new Error(
            `publication ${publication.id} references unavailable package ${publication.package}`,
          );
        plan = compilePackage(pkg, getTarget(publication.target));
        // Retain actual PACKAGE.yaml provenance and package identity; reporting is keyed by the publication id.
        plan = {
          ...plan,
          redactions: definition.redactions ?? [],
          outputs: plan.outputs.map((output) => ({
            ...output,
            provenance: { ...output.provenance, publicationId: publication.id },
          })),
          diagnostics: plan.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            provenance: { ...diagnostic.provenance, publicationId: publication.id },
          })),
        };
        validatePackageOutput(plan, outputRoot);
      } else {
        if (!definition.defaults)
          throw new Error('marketplace publications require repository defaults');
        // The legacy marketplace planner is shared; only the repository authoring and output anchors differ.
        const marketplace: LoadedMarketplace = {
          path: loaded.path,
          definition: {
            schema: 'agentforge.marketplace/v1',
            id: definition.id,
            defaults: definition.defaults,
            packages: definition.packages,
            publications: [{ ...publication, 'root-manifest': false }],
            ...(definition.redactions === undefined ? {} : { redactions: definition.redactions }),
          },
          packages,
        };
        plan = compileMarketplace(marketplace, allTargets());
        if (publication['root-manifest']) {
          const registry = plan.outputs.find(
            (output) => output.destination === publication.destination,
          );
          if (!registry)
            throw new Error(
              `publication ${publication.id} has no registry at ${publication.destination}`,
            );
          plan = {
            ...plan,
            rootOutputs: [
              buildRootManifestOutput(publication, registry, root, outputRoot, outputRoot),
            ],
          };
        }
      }
      planned.plan = plan;
      for (const output of plan.outputs) {
        if (output.kind === 'copy' && output.sourceRoot) sources.add(resolve(output.sourceRoot));
      }
      validateCompilationSources(plan);
    } catch (cause) {
      issues.push({
        code: 'planning-failed',
        publicationId: publication.id,
        message: message(cause),
      });
    }
  }
  validateRepositoryOwnership({ loaded, publications, issues }, sources);
  return { loaded, publications, issues };
}

function collision(a: string, b: string): boolean {
  return publicationPathsOverlap(a, b) || publicationPathsOverlap(physicalPath(a), physicalPath(b));
}

function validateRepositoryOwnership(plan: RepositoryPlan, sources: ReadonlySet<string>): void {
  const { loaded, publications, issues } = plan;
  const snapshots = publications.map((publication) => ({
    id: publication.definition.id,
    path: publication.outputRoot,
  }));
  const files: Array<{ id: string; path: string }> = [];
  for (const publication of publications) {
    for (const output of publication.plan?.rootOutputs ?? []) {
      try {
        const path = repositoryPath(loaded.root, output.destination);
        const entry = lstatSync(path, { throwIfNoEntry: false });
        if (entry && !entry.isFile())
          throw new Error(`root manifest must replace only a regular file: ${path}`);
        files.push({ id: publication.definition.id, path });
      } catch (cause) {
        issues.push({
          code: 'unsafe-path',
          publicationId: publication.definition.id,
          message: message(cause),
        });
      }
    }
  }
  const claims = [...snapshots, ...files];
  for (const [i, claim] of claims.entries()) {
    try {
      for (const source of sources) {
        if (collision(claim.path, source))
          issues.push({
            code: 'unsafe-path',
            publicationId: claim.id,
            message: `source/output overlap between ${source} and ${claim.path}`,
          });
      }
      for (const other of claims.slice(i + 1)) {
        if (!collision(claim.path, other.path)) continue;
        const detail = `publication outputs ${claim.id} (${claim.path}) and ${other.id} (${other.path}) overlap`;
        for (const id of new Set([claim.id, other.id]))
          issues.push({ code: 'output-collision', publicationId: id, message: detail });
      }
    } catch (cause) {
      issues.push({ code: 'unsafe-path', publicationId: claim.id, message: message(cause) });
    }
  }
}

function reportFor(plan: RepositoryPlan): RepositoryReport {
  return {
    schemaVersion: 1,
    repositoryId: plan.loaded.definition.id,
    config: plan.loaded.path,
    status: plan.issues.length ? 'failed' : 'ok',
    errors: [...plan.issues],
    publications: plan.publications.map(({ definition, outputRoot }) => ({
      id: definition.id,
      target: definition.target,
      out: outputRoot,
      status: 'not-attempted',
    })),
  };
}

/** Failure to load the config still has a machine-readable report in JSON mode. */
export function repositoryFailureReport(path: string, cause: unknown): RepositoryReport {
  return {
    schemaVersion: 1,
    config: resolve(path),
    status: 'failed',
    errors: [{ code: 'invalid-definition', message: message(cause) }],
    publications: [],
  };
}

/** Whole-repository preflight, then independent recoverable snapshots. Not a batch transaction. */
export function materializeRepository(plan: RepositoryPlan): RepositoryReport {
  const report = reportFor(plan);
  if (plan.issues.length) {
    for (const publication of report.publications)
      if (plan.issues.some((issue) => issue.publicationId === publication.id))
        publication.status = 'failed';
    return report;
  }
  for (const [index, publication] of plan.publications.entries()) {
    const result = report.publications[index];
    if (!result) throw new Error('missing publication report');
    try {
      if (!publication.plan) throw new Error('publication has no compilation plan');
      // Recheck the whole ownership boundary: source/output paths may have changed since preflight.
      assertPublicationUnchanged(plan, publication);
      validateCompilationSources(publication.plan);
      if (publication.definition.kind === 'package')
        materializePackage(publication.plan, publication.outputRoot);
      else materializeCompilation(publication.plan, publication.outputRoot);
      result.status = 'published';
    } catch (cause) {
      report.status = 'failed';
      result.status = 'failed';
      report.errors.push({
        code: 'publication-failed',
        publicationId: publication.definition.id,
        message: message(cause),
      });
      break;
    }
  }
  return report;
}

function assertPublicationUnchanged(plan: RepositoryPlan, publication: PlannedPublication): void {
  assertRealPath(plan.loaded.root, publication.outputRoot);
  const entry = lstatSync(publication.outputRoot, { throwIfNoEntry: false });
  if (entry && !entry.isDirectory())
    throw new Error(`snapshot output must be a directory: ${publication.outputRoot}`);
  for (const source of plan.loaded.definition.packages) {
    const absolute = repositoryPath(plan.loaded.root, source);
    if (collision(dirname(absolute), publication.outputRoot))
      throw new Error(`source/output overlap: ${absolute}`);
  }
  for (const output of publication.plan?.rootOutputs ?? []) {
    const path = repositoryPath(plan.loaded.root, output.destination);
    if (collision(path, plan.loaded.path))
      throw new Error(`root manifest overlaps repository config: ${path}`);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (entry && !entry.isFile())
      throw new Error(`root manifest must replace only a regular file: ${path}`);
  }
}

/** Check safe publications independently; planning errors never masquerade as a current output. */
export function checkRepository(plan: RepositoryPlan): RepositoryReport {
  const report = reportFor(plan);
  for (const [index, publication] of plan.publications.entries()) {
    const result = report.publications[index];
    if (!result) throw new Error('missing publication report');
    if (
      !publication.plan ||
      plan.issues.some((issue) => issue.publicationId === publication.definition.id)
    ) {
      result.status = 'failed';
      report.status = 'failed';
      continue;
    }
    try {
      assertPublicationUnchanged(plan, publication);
      const checked = checkCompilationSnapshot(publication.plan, publication.outputRoot);
      result.report = buildCheckReport(publication.plan, checked);
      result.status = result.report.status;
      if (result.status === 'failed') report.status = 'failed';
    } catch (cause) {
      report.status = 'failed';
      result.status = 'failed';
      report.errors.push({
        code: 'check-failed',
        publicationId: publication.definition.id,
        message: message(cause),
      });
    }
  }
  return report;
}
