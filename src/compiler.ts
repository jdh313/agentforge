import { deepMerge } from './deep-merge.ts';
import type {
  DeclaredLossDefinition,
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
  producer?: OutputProducer;
  collision?: 'override';
}

export type OutputProducer = 'generated' | 'translated' | 'supplied';

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
  producer?: OutputProducer;
  collision?: 'override';
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
  resources: readonly LoadedArtifact[];
  exemptDocuments: ReadonlySet<string>;
  // Frontmatter keys declared authoring-layer: stripped from every target's
  // output, reported nowhere.
  authoringKeys: ReadonlySet<string>;
  payloads: readonly PackagePayload[];
  losses: readonly DeclaredLossDefinition[];
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

  const resolvedOutputs = resolveDestinations(outputs, diagnostics);
  resolvedOutputs.sort(compareOutputs);
  diagnostics.sort(compareDiagnostics);
  return { marketplaceId: loaded.definition.id, outputs: resolvedOutputs, diagnostics };
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
      resources: loadedPackage.resources,
      exemptDocuments: loadedPackage.exemptDocuments,
      authoringKeys: new Set(loadedPackage.definition['authoring-keys'] ?? []),
      payloads: loadedPackage.payloads[publication.target] ?? [],
      losses: target.losses ?? [],
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

function resolveDestinations(
  outputs: readonly DesiredOutput[],
  diagnostics: CompilationDiagnostic[],
): DesiredOutput[] {
  const buckets = new Map<string, DesiredOutput[]>();
  for (const output of outputs) {
    const reason = unsafeDestinationReason(output.destination);
    if (reason) {
      throw new CompilationError(
        `unsafe output destination "${output.destination}" from ${describeProvenance(output.provenance)}: ${reason}`,
      );
    }

    const collisionKey = destinationCollisionKey(output.destination);
    const prefixCollision = [...buckets.entries()].find(([priorKey]) => {
      return collisionKey.startsWith(`${priorKey}/`) || priorKey.startsWith(`${collisionKey}/`);
    });
    if (prefixCollision) {
      const priorOutput = prefixCollision[1][0];
      if (!priorOutput) throw new Error('missing claimed output');
      throw new CompilationError(
        `output destinations "${priorOutput.destination}" and "${output.destination}" conflict as file and directory between ${describeProvenance(priorOutput.provenance)} and ${describeProvenance(output.provenance)}`,
      );
    }
    const bucket = buckets.get(collisionKey);
    if (bucket) bucket.push(output);
    else buckets.set(collisionKey, [output]);
  }

  return [...buckets.values()].map((bucket) => resolveCollision(bucket, diagnostics));
}

function resolveCollision(
  outputs: readonly DesiredOutput[],
  diagnostics: CompilationDiagnostic[],
): DesiredOutput {
  const ordered = [...outputs].sort(compareCollisionOutputs);
  const first = ordered[0];
  if (!first) throw new Error('cannot resolve an empty destination bucket');
  if (ordered.length === 1) return first;

  const overriding = ordered.filter(
    (output) => output.producer === 'supplied' && output.collision === 'override',
  );
  const winner = overriding.length === 1 ? overriding[0] : undefined;
  const losers = winner ? ordered.filter((output) => output !== winner) : [];
  if (
    winner &&
    losers.length === 1 &&
    losers.every(
      (output) =>
        (output.producer === 'generated' || output.producer === 'translated') &&
        sameProducerScope(output, winner),
    )
  ) {
    const replaced = losers
      .map(({ producer }) => producer)
      .toSorted()
      .join(' and ');
    diagnostics.push({
      code: 'supplied-output-override',
      severity: 'note',
      message: `Supplied payload replaced ${replaced} output at "${winner.destination}".`,
      target: winner.target,
      provenance: winner.provenance,
    });
    return winner;
  }

  if (winner && losers.length > 1) {
    throw new CompilationError(
      `supplied output "${winner.destination}" cannot override ${losers.length} colliding outputs for ${describeProvenance(winner.provenance)}; resolve the producer collision first`,
    );
  }

  const supplied = ordered.find(({ producer }) => producer === 'supplied');
  const other = supplied
    ? ordered.find(
        (output) =>
          output !== supplied &&
          (output.producer === 'generated' || output.producer === 'translated'),
      )
    : undefined;
  if (supplied && other && sameProducerScope(supplied, other)) {
    throw new CompilationError(
      `supplied output "${supplied.destination}" collides with ${other.producer} output for ${describeProvenance(supplied.provenance)}; set collision: override on the supplied payload to replace it`,
    );
  }

  const second = ordered[1];
  if (!second) throw new Error('missing colliding output');
  const destinationDetail =
    first.destination === second.destination
      ? `output destination "${second.destination}" collides`
      : `output destinations "${first.destination}" and "${second.destination}" collide`;
  throw new CompilationError(
    `${destinationDetail} between ${describeProvenance(first.provenance)} and ${describeProvenance(second.provenance)}`,
  );
}

function compareCollisionOutputs(left: DesiredOutput, right: DesiredOutput): number {
  return (
    compareStrings(left.target, right.target) ||
    compareProvenance(left.provenance, right.provenance) ||
    compareStrings(left.destination, right.destination) ||
    compareStrings(left.producer ?? '', right.producer ?? '') ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(
      left.kind === 'copy' ? left.sourcePath : left.content,
      right.kind === 'copy' ? right.sourcePath : right.content,
    )
  );
}

function sameProducerScope(left: DesiredOutput, right: DesiredOutput): boolean {
  return (
    left.target === right.target &&
    left.provenance.marketplacePath === right.provenance.marketplacePath &&
    left.provenance.publicationId === right.provenance.publicationId &&
    left.provenance.packageId !== undefined &&
    left.provenance.packageId === right.provenance.packageId
  );
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
