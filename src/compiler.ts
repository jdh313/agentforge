import { deepMerge } from './deep-merge.ts';
import type {
  LoadedMarketplace,
  MarketplaceDefinition,
  NativeOverlay,
  PackageDefinition,
} from './definitions.ts';
import type { TargetName } from './types.ts';

type PublicationDefinition = MarketplaceDefinition['publications'][number];
type MarketplaceMetadata = MarketplaceDefinition['defaults'];
type PackageMetadata = PackageDefinition['defaults'];

export interface CompilationProvenance {
  marketplacePath: string;
  publicationId: string;
  packageId?: string;
}

interface ProposedOutputBase {
  destination: string;
  packageId?: string;
}

export interface ProposedGeneratedOutput extends ProposedOutputBase {
  kind: 'generated';
  content: string;
}

export interface ProposedCopiedOutput extends ProposedOutputBase {
  kind: 'copy';
  sourcePath: string;
}

export type ProposedOutput = ProposedGeneratedOutput | ProposedCopiedOutput;

interface DesiredOutputBase {
  destination: string;
  target: TargetName;
  provenance: CompilationProvenance;
}

export interface DesiredGeneratedOutput extends DesiredOutputBase {
  kind: 'generated';
  content: string;
}

export interface DesiredCopiedOutput extends DesiredOutputBase {
  kind: 'copy';
  sourcePath: string;
}

export type DesiredOutput = DesiredGeneratedOutput | DesiredCopiedOutput;

export interface RetainedSource {
  artifactType: string;
  sourcePath: string;
}

export interface ProposedCompilationDiagnostic {
  code: string;
  severity: 'note' | 'warning';
  message: string;
  packageId?: string;
  retainedSource?: RetainedSource;
}

export interface CompilationDiagnostic extends Omit<ProposedCompilationDiagnostic, 'packageId'> {
  target: TargetName;
  provenance: CompilationProvenance;
}

export interface CompilationPackage {
  id: string;
  path: string;
  metadata: PackageMetadata;
  native: NativeOverlay;
  artifacts: ReadonlyMap<string, readonly string[]>;
}

export interface PublicationCompilation {
  marketplace: {
    id: string;
    path: string;
    metadata: MarketplaceMetadata;
  };
  publication: {
    id: string;
    target: TargetName;
    destination: string;
    native: NativeOverlay;
  };
  packages: readonly CompilationPackage[];
}

export interface TargetCompilationResult {
  outputs: readonly ProposedOutput[];
  diagnostics?: readonly ProposedCompilationDiagnostic[];
}

export interface TargetCompilerAdapter {
  target: TargetName;
  compilePublication(input: PublicationCompilation): TargetCompilationResult;
}

export interface CompilationPlan {
  marketplaceId: string;
  outputs: readonly DesiredOutput[];
  diagnostics: readonly CompilationDiagnostic[];
}

export class CompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompilationError';
  }
}

export function compileMarketplace(
  loaded: LoadedMarketplace,
  adapters: readonly TargetCompilerAdapter[],
): CompilationPlan {
  const adaptersByTarget = indexAdapters(adapters);
  const outputs: DesiredOutput[] = [];
  const diagnostics: CompilationDiagnostic[] = [];

  for (const publication of loaded.definition.publications.toSorted(compareIds)) {
    const adapter = adaptersByTarget.get(publication.target);
    if (!adapter) {
      throw new CompilationError(
        `publication "${publication.id}" targets "${publication.target}", but no compiler adapter was provided`,
      );
    }

    const packages = resolvePackages(loaded, publication);
    const result = adapter.compilePublication({
      marketplace: {
        id: loaded.definition.id,
        path: loaded.path,
        metadata: loaded.definition.defaults,
      },
      publication: {
        id: publication.id,
        target: publication.target,
        destination: publication.destination,
        native: publication.native ?? {},
      },
      packages,
    });

    for (const output of result.outputs) {
      const { packageId, ...detail } = output;
      outputs.push({
        ...detail,
        target: publication.target,
        provenance: provenanceFor(loaded, publication, packageId),
      });
    }

    for (const diagnostic of result.diagnostics ?? []) {
      const { packageId, ...detail } = diagnostic;
      diagnostics.push({
        ...detail,
        target: publication.target,
        provenance: provenanceFor(loaded, publication, packageId),
      });
    }
  }

  outputs.sort(compareOutputs);
  diagnostics.sort(compareDiagnostics);
  return { marketplaceId: loaded.definition.id, outputs, diagnostics };
}

function indexAdapters(
  adapters: readonly TargetCompilerAdapter[],
): ReadonlyMap<TargetName, TargetCompilerAdapter> {
  const byTarget = new Map<TargetName, TargetCompilerAdapter>();
  for (const adapter of adapters) {
    if (byTarget.has(adapter.target)) {
      throw new CompilationError(
        `multiple compiler adapters were provided for "${adapter.target}"`,
      );
    }
    byTarget.set(adapter.target, adapter);
  }
  return byTarget;
}

function resolvePackages(
  loaded: LoadedMarketplace,
  publication: PublicationDefinition,
): CompilationPackage[] {
  const packageIds =
    publication.enrollment.mode === 'include'
      ? publication.enrollment.packages
      : [...loaded.packages.values()]
          .filter((candidate) => publication.target in candidate.definition.targets)
          .map((candidate) => candidate.definition.id);

  return packageIds.toSorted().map((packageId) => {
    const loadedPackage = loaded.packages.get(packageId);
    if (!loadedPackage) {
      throw new CompilationError(
        `publication "${publication.id}" includes unknown package "${packageId}"`,
      );
    }
    const target = loadedPackage.definition.targets[publication.target];
    if (!target) {
      throw new CompilationError(
        `publication "${publication.id}" includes package "${packageId}", which does not declare target "${publication.target}"`,
      );
    }

    return {
      id: packageId,
      path: loadedPackage.path,
      metadata: deepMerge(
        { ...loadedPackage.definition.defaults },
        { ...(target.overrides ?? {}) },
      ) as PackageMetadata,
      native: target.native ?? {},
      artifacts: loadedPackage.artifacts,
    };
  });
}

function provenanceFor(
  loaded: LoadedMarketplace,
  publication: PublicationDefinition,
  packageId?: string,
): CompilationProvenance {
  return {
    marketplacePath: loaded.path,
    publicationId: publication.id,
    ...(packageId === undefined ? {} : { packageId }),
  };
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function compareOutputs(left: DesiredOutput, right: DesiredOutput): number {
  return (
    compareProvenance(left.provenance, right.provenance) ||
    left.destination.localeCompare(right.destination)
  );
}

function compareDiagnostics(left: CompilationDiagnostic, right: CompilationDiagnostic): number {
  return (
    compareProvenance(left.provenance, right.provenance) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function compareProvenance(left: CompilationProvenance, right: CompilationProvenance): number {
  return (
    left.publicationId.localeCompare(right.publicationId) ||
    (left.packageId ?? '').localeCompare(right.packageId ?? '')
  );
}
