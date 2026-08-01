import { dirname, relative, sep } from 'node:path';
import { detectClaudeOnlyConstructs } from '../compatibility.ts';
import {
  CompilationError,
  type CompilationPackage,
  type ProposedCompilationDiagnostic,
  type ProposedOutput,
  type PublicationCompilation,
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
  // When set, a Claude-only construct that would be silently lost must carry a
  // declared disposition for this target or compilation fails.
  requireConstructDispositions?: boolean;
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

  if (policy.requireConstructDispositions) {
    diagnostics.push(...resolveConstructDispositions(input, packageInput));
  }

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
          producer: 'generated',
          packageId: packageInput.id,
          destination: `${skillDirectory}/SKILL.md`,
          content: projection.content,
        });
        outputs.push(
          ...projection.generatedFiles.map(({ relativePath, content }) => ({
            kind: 'generated' as const,
            producer: 'generated' as const,
            packageId: packageInput.id,
            destination: `${skillDirectory}/${relativePath}`,
            content,
          })),
        );
        outputs.push(
          ...projection.resources.map(({ relativePath, sourcePath }) => ({
            kind: 'copy' as const,
            producer: 'generated' as const,
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
        outputs.push(
          ...translated.outputs.map((output) => ({
            ...output,
            producer: 'translated' as const,
          })),
        );
        diagnostics.push(...translated.diagnostics);
        continue;
      }

      if (policy.passthroughArtifactTypes.has(artifactType)) {
        outputs.push({
          kind: 'copy',
          producer: 'translated',
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
    ...packageInput.payloads.map(({ collision, destination, executable, sourcePath }) => ({
      kind: 'copy' as const,
      producer: 'supplied' as const,
      packageId: packageInput.id,
      destination: `${packageDirectory}/${destination}`,
      sourcePath,
      sourceRoot: packageRoot,
      executable,
      ...(collision === undefined ? {} : { collision }),
    })),
  );

  return { outputs, diagnostics };
}

// The body-pattern check in `render.ts` reads skill bodies only, so an agent's
// `tools:` filter or an `mcp__*` reference passes it unexamined and disappears
// from output with nothing said. Requiring a declared disposition turns that
// silence into a compile error naming the construct.
function resolveConstructDispositions(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
): ProposedCompilationDiagnostic[] {
  const declared = new Map(
    packageInput.dispositions.map((disposition) => [disposition.construct, disposition]),
  );
  const { detected, unknown } = detectClaudeOnlyConstructs({
    artifacts: packageInput.artifacts,
    resources: packageInput.resources,
    exemptDocuments: packageInput.exemptDocuments,
    target: input.publication.target,
  });
  const site = (sourcePath: string, line?: number) => {
    const relative = relativePackageArtifactPath(packageInput.path, sourcePath);
    return line === undefined ? relative : `${relative}:${line}`;
  };
  const undeclared = detected.filter(({ construct }) => !declared.has(construct));

  if (undeclared.length > 0) {
    const detail = undeclared
      .map(
        ({ construct, sourcePath, line, detail: why }) =>
          `  - ${construct}: ${site(sourcePath, line)} ${why}`,
      )
      .join('\n');
    throw new CompilationError(
      `package "${packageInput.id}" uses Claude-only constructs with no declared disposition for target "${input.publication.target}":\n${detail}\n` +
        `Declare each under targets.${input.publication.target}.dispositions in ${packageInput.path}, or remove the construct.`,
    );
  }

  const diagnostics: ProposedCompilationDiagnostic[] = [];

  // A construct-shaped string the capability table does not classify is
  // reported, never gated. The old enumerated list was silent about everything
  // it did not name, so a construct Claude ships next shipped unexamined
  // (ndr:rm06pf); gating one we cannot confirm is lost would breach ndr:4nshwv.
  for (const { literal, sourcePath, line } of unknown) {
    diagnostics.push({
      code: 'unclassified-construct',
      severity: 'warning',
      packageId: packageInput.id,
      message: `Unclassified Claude-only construct "${literal}" at ${site(sourcePath, line)} for target "${input.publication.target}"; no capability-table entry covers it.`,
    });
  }

  // Declaring a disposition must not buy silence (ndr:62pj9p). Report each
  // declaration that actually matched, and name every occurrence it covers — a
  // note listing only the construct type gets less specific exactly as
  // detection coverage grows.
  const occurrences = new Map<string, string[]>();
  for (const { construct, sourcePath, line } of detected) {
    const sites = occurrences.get(construct) ?? [];
    sites.push(site(sourcePath, line));
    occurrences.set(construct, sites);
  }

  for (const { construct, disposition, note } of declared.values()) {
    const sites = occurrences.get(construct);
    if (!sites) continue;
    diagnostics.push({
      code: 'declared-construct-disposition',
      severity: 'note',
      packageId: packageInput.id,
      message:
        `Claude-only construct "${construct}" is ${disposition} for target "${input.publication.target}"${note ? `: ${note}` : '.'}` +
        ` Occurrences: ${sites.join(', ')}.`,
    });
  }

  return diagnostics;
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
