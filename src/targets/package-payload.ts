import { dirname, relative, sep } from 'node:path';
import type {
  CompilationPackage,
  ProposedCompilationDiagnostic,
  ProposedOutput,
  PublicationCompilation,
} from '../compiler.ts';
import type { LoadedArtifact } from '../definitions.ts';
import { projectArtifact } from '../render.ts';
import type { TargetName } from '../types.ts';

export interface PackagePayloadResult {
  outputs: ProposedOutput[];
  diagnostics: ProposedCompilationDiagnostic[];
}

export interface ArtifactTranslatorInput {
  artifact: LoadedArtifact;
  packageDirectory: string;
  packageInput: CompilationPackage;
}

export type ArtifactTranslator = (input: ArtifactTranslatorInput) => PackagePayloadResult;

export interface PackagePayloadPolicy {
  passthroughArtifactTypes: ReadonlySet<string>;
  translators: ReadonlyMap<string, ArtifactTranslator>;
}

export function compilePackagePayload(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
  policy: PackagePayloadPolicy,
): PackagePayloadResult {
  const outputs: ProposedOutput[] = [];
  const diagnostics: ProposedCompilationDiagnostic[] = [];
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  const packageRoot = dirname(packageInput.path);

  for (const [artifactType, artifacts] of [...packageInput.artifacts.entries()].toSorted(
    ([left], [right]) => compareStrings(left, right),
  )) {
    for (const artifact of artifacts) {
      if (artifactType === 'skill') {
        const projection = projectArtifact({
          artifact: 'skill',
          target: input.publication.target,
          sourcePath: artifact.path,
          source: artifact.content,
          resourcePaths: packageInput.files,
        });
        const skillDirectory = `${packageDirectory}/skills/${projection.artifactName}`;
        outputs.push({
          kind: 'generated',
          packageId: packageInput.id,
          destination: `${skillDirectory}/SKILL.md`,
          content: projection.content,
        });
        outputs.push(
          ...projection.resources.map(({ relativePath, sourcePath }) => ({
            kind: 'copy' as const,
            packageId: packageInput.id,
            destination: `${skillDirectory}/${relativePath}`,
            sourcePath,
          })),
        );
        diagnostics.push(
          ...projection.warnings.map((warning) => ({
            code: warning.kind,
            severity: 'warning' as const,
            packageId: packageInput.id,
            message: `Skill "${projection.artifactName}": ${warning.detail}.`,
          })),
        );
        continue;
      }

      const translator = policy.translators.get(artifactType);
      if (translator) {
        const translated = translator({ artifact, packageDirectory, packageInput });
        outputs.push(...translated.outputs);
        diagnostics.push(...translated.diagnostics);
        continue;
      }

      if (policy.passthroughArtifactTypes.has(artifactType)) {
        outputs.push({
          kind: 'copy',
          packageId: packageInput.id,
          destination: `${packageDirectory}/${portableRelative(packageRoot, artifact.path)}`,
          sourcePath: artifact.path,
        });
        continue;
      }

      diagnostics.push(
        unsupportedProjection(input.publication.target, packageInput, artifactType, artifact.path),
      );
    }
  }

  outputs.push(
    ...packageInput.payloads.map(({ destination, executable, sourcePath }) => ({
      kind: 'copy' as const,
      packageId: packageInput.id,
      destination: `${packageDirectory}/${destination}`,
      sourcePath,
      executable,
    })),
  );

  return { outputs, diagnostics };
}

function unsupportedProjection(
  target: TargetName,
  packageInput: CompilationPackage,
  artifactType: string,
  sourcePath: string,
): ProposedCompilationDiagnostic {
  return {
    code: 'unsupported-artifact-projection',
    severity: 'note',
    packageId: packageInput.id,
    message: `Target "${target}" does not support artifact projection "${artifactType}"; source retained.`,
    retainedSource: { artifactType, sourcePath },
  };
}

export function relativePackageDirectory(marketplacePath: string, packagePath: string): string {
  return portableRelative(dirname(marketplacePath), dirname(packagePath));
}

export function relativePackageArtifactPath(packagePath: string, artifactPath: string): string {
  return portableRelative(dirname(packagePath), artifactPath);
}

function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
