import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CompilationDiagnostic, CompilationPlan, DesiredOutput } from './compiler.ts';
import { resolveOutputDestinations } from './compiler.ts';
import type { ArtifactProjection } from './render.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import type { ArtifactType, TargetName, Warning } from './types.ts';

export interface BuildArtifactPlanOptions {
  sourceDir: string;
  target: TargetName;
  artifact: ArtifactType;
  publicationId: string;
  projection: ArtifactProjection;
  prefix?: string;
}

export interface PlannedArtifact {
  artifactName: string;
  canonicalDestination: string;
  plan: CompilationPlan;
  resourcesCopied: string[];
  warnings: Warning[];
}

/** Turn one loaded projection into the plan shape shared by render and install. */
export function buildArtifactPlan(options: BuildArtifactPlanOptions): PlannedArtifact {
  const sourceDir = resolve(options.sourceDir);
  const projection = options.projection;
  const proposed = buildArtifactOutputs(projection, options.artifact, options.prefix);
  const canonicalDestination = proposed[0]?.destination;
  if (!canonicalDestination) throw new Error('missing canonical output');

  const provenance = {
    marketplacePath: join(sourceDir, ARTIFACT_DEFS[options.artifact].canonicalFilename),
    publicationId: options.publicationId,
  };
  const outputs: DesiredOutput[] = proposed.map((output) =>
    output.kind === 'generated'
      ? { ...output, target: options.target, provenance }
      : {
          ...output,
          target: options.target,
          provenance,
          sourceRoot: sourceDir,
          executable: (lstatSync(output.sourcePath).mode & 0o111) !== 0,
        },
  );
  const diagnostics = diagnosticsFor(projection, options.target, provenance);
  const resolvedOutputs = resolveOutputDestinations(outputs, diagnostics).toSorted((left, right) =>
    compareStrings(left.destination, right.destination),
  );
  diagnostics.sort(
    (left, right) =>
      compareStrings(left.code, right.code) || compareStrings(left.message, right.message),
  );

  return {
    artifactName: projection.artifactName,
    canonicalDestination,
    plan: {
      marketplaceId: options.publicationId,
      outputs: resolvedOutputs,
      diagnostics,
      rootOutputs: [],
      redactions: [],
    },
    resourcesCopied: [
      ...new Set(projection.resources.map(({ relativePath }) => relativePath.split('/')[0])),
    ],
    warnings: [...projection.warnings],
  };
}

/** Give a projection paths relative to the root its caller owns. */
export function buildArtifactOutputs(
  projection: ArtifactProjection,
  artifact: ArtifactType,
  prefix = '',
): readonly import('./compiler.ts').ProposedOutput[] {
  const artifactDef = ARTIFACT_DEFS[artifact];
  const at = (relativePath: string) =>
    prefix.length === 0 ? relativePath : `${prefix}/${relativePath}`;
  const canonicalDestination =
    artifactDef.layout === 'file'
      ? at(`${projection.artifactName}${projection.extension ?? '.md'}`)
      : at(artifactDef.canonicalFilename);

  return [
    {
      kind: 'generated',
      producer: 'generated',
      destination: canonicalDestination,
      content: projection.content,
    },
    ...projection.generatedFiles.map(({ relativePath, content }) => ({
      kind: 'generated' as const,
      producer: 'generated' as const,
      destination: at(relativePath),
      content,
    })),
    ...projection.resources.map(({ relativePath, sourcePath }) => ({
      kind: 'copy' as const,
      producer: 'generated' as const,
      destination: at(relativePath),
      sourcePath,
    })),
  ];
}

function diagnosticsFor(
  projection: ArtifactProjection,
  target: TargetName,
  provenance: CompilationDiagnostic['provenance'],
): CompilationDiagnostic[] {
  return projection.warnings.map((warning) => ({
    code: warning.kind,
    severity: 'warning',
    message: `Artifact ${JSON.stringify(projection.artifactName)}: ${warning.detail}.`,
    target,
    provenance,
  }));
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
