import { deepMerge } from './deep-merge.ts';
import type {
  LoadedArtifact,
  LoadedMarketplace,
  MarketplaceDefinition,
  NativeOverlay,
  PackageDefinition,
} from './definitions.ts';
import type { PackagePayload } from './package-payload-plan.ts';
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
  executable?: boolean;
  sourceRoot?: string;
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
  executable?: boolean;
  sourceRoot?: string;
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
  artifacts: ReadonlyMap<string, readonly LoadedArtifact[]>;
  files: readonly string[];
  payloads: readonly PackagePayload[];
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
    const enrolledPackageIds = new Set(packages.map(({ id }) => id));
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
      validatePackageProvenance(packageId, enrolledPackageIds, publication, 'output');
      outputs.push({
        ...detail,
        target: publication.target,
        provenance: provenanceFor(loaded, publication, packageId),
      });
    }

    for (const diagnostic of result.diagnostics ?? []) {
      const { packageId, ...detail } = diagnostic;
      validatePackageProvenance(packageId, enrolledPackageIds, publication, 'diagnostic');
      diagnostics.push({
        ...detail,
        target: publication.target,
        provenance: provenanceFor(loaded, publication, packageId),
      });
    }
  }

  outputs.sort(compareOutputs);
  diagnostics.sort(compareDiagnostics);
  validateDestinations(outputs);
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
      files: loadedPackage.files,
      payloads: loadedPackage.payloads[publication.target] ?? [],
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
  return compareStrings(left.id, right.id);
}

function compareOutputs(left: DesiredOutput, right: DesiredOutput): number {
  return (
    compareProvenance(left.provenance, right.provenance) ||
    compareStrings(left.destination, right.destination)
  );
}

function compareDiagnostics(left: CompilationDiagnostic, right: CompilationDiagnostic): number {
  return (
    compareProvenance(left.provenance, right.provenance) ||
    compareStrings(left.code, right.code) ||
    compareStrings(left.message, right.message)
  );
}

function compareProvenance(left: CompilationProvenance, right: CompilationProvenance): number {
  return (
    compareStrings(left.publicationId, right.publicationId) ||
    compareStrings(left.packageId ?? '', right.packageId ?? '')
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateDestinations(outputs: readonly DesiredOutput[]): void {
  const claimed = new Map<string, DesiredOutput>();
  for (const output of outputs) {
    const reason = unsafeDestinationReason(output.destination);
    if (reason) {
      throw new CompilationError(
        `unsafe output destination "${output.destination}" from ${describeProvenance(output.provenance)}: ${reason}`,
      );
    }

    const collisionKey = destinationCollisionKey(output.destination);
    const prior = claimed.get(collisionKey);
    if (prior) {
      const destinationDetail =
        prior.destination === output.destination
          ? `output destination "${output.destination}" collides`
          : `output destinations "${prior.destination}" and "${output.destination}" collide`;
      throw new CompilationError(
        `${destinationDetail} between ${describeProvenance(prior.provenance)} and ${describeProvenance(output.provenance)}`,
      );
    }
    const prefixCollision = [...claimed.entries()].find(([priorKey]) => {
      return collisionKey.startsWith(`${priorKey}/`) || priorKey.startsWith(`${collisionKey}/`);
    });
    if (prefixCollision) {
      const priorOutput = prefixCollision[1];
      throw new CompilationError(
        `output destinations "${priorOutput.destination}" and "${output.destination}" conflict as file and directory between ${describeProvenance(priorOutput.provenance)} and ${describeProvenance(output.provenance)}`,
      );
    }
    claimed.set(collisionKey, output);
  }
}

function unsafeDestinationReason(destination: string): string | undefined {
  if (destination.length === 0) return 'destination must not be empty';
  if (containsControlCharacter(destination)) return 'control characters are not allowed';
  if (destination.includes('\\')) return 'use portable forward-slash separators';
  if (destination.startsWith('/') || /^[A-Za-z]:/.test(destination)) {
    return 'destination must be relative';
  }

  const segments = destination.split('/');
  if (segments.includes('..')) return 'parent-directory segments are not allowed';
  if (segments.some((segment) => segment.length === 0 || segment === '.')) {
    return 'destination must be a normalized file path';
  }
  if (segments.some((segment) => segment.endsWith('.') || segment.endsWith(' '))) {
    return 'path segments must not end with a dot or space';
  }
  return undefined;
}

function destinationCollisionKey(destination: string): string {
  return destination.normalize('NFC').toLowerCase();
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function describeProvenance(provenance: CompilationProvenance): string {
  const packageDetail =
    provenance.packageId === undefined ? '' : `, package "${provenance.packageId}"`;
  return `publication "${provenance.publicationId}"${packageDetail}`;
}

function validatePackageProvenance(
  packageId: string | undefined,
  enrolledPackageIds: ReadonlySet<string>,
  publication: PublicationDefinition,
  recordType: 'output' | 'diagnostic',
): void {
  if (packageId === undefined || enrolledPackageIds.has(packageId)) return;
  throw new CompilationError(
    `adapter returned ${recordType} for package "${packageId}", which is not enrolled in publication "${publication.id}"`,
  );
}
