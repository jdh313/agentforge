import { dirname } from 'node:path';
import matter from 'gray-matter';
import {
  type DetectedConstruct,
  type DetectionResult,
  detectClaudeOnlyConstructs,
  type RetentionCheck,
} from '../compatibility.ts';
import {
  CompilationError,
  type CompilationPackage,
  type ProposedCompilationDiagnostic,
  type ProposedOutput,
  type PublicationCompilation,
} from '../compiler.ts';
import type {
  ClaudeOnlyConstruct,
  DeclaredLossDefinition,
  LoadedArtifact,
} from '../definitions.ts';
import { portableRelative } from '../paths.ts';
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
  // declared loss for this target or compilation fails.
  requireDeclaredLosses?: boolean;
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
  // Which generated content each source produced. A declared loss's state is a
  // claim about the emitted output, so verifying it needs the output — but the
  // undeclared gate must still fail before any translation work is spent, so
  // the two halves run at opposite ends of this function.
  const generatedBySource = new Map<string, string[]>();
  const attribute = (sourcePath: string, contents: readonly string[]) => {
    const existing = generatedBySource.get(sourcePath) ?? [];
    existing.push(...contents);
    generatedBySource.set(sourcePath, existing);
  };

  const detection = policy.requireDeclaredLosses
    ? gateUndeclaredLosses(input, packageInput)
    : undefined;

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
          authoringKeys: packageInput.authoringKeys,
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
        attribute(artifact.path, [
          projection.content,
          ...projection.generatedFiles.map(({ content }) => content),
        ]);
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
        attribute(
          artifact.path,
          translated.outputs.flatMap((output) =>
            output.kind === 'generated' ? [output.content] : [],
          ),
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

  if (detection) {
    // Put these back at the front. They belong with the gate that produced
    // them; they trail the artifact diagnostics only because verification has
    // to wait for the output it verifies against.
    diagnostics.unshift(
      ...reportDeclaredLosses(input, packageInput, detection, {
        generatedBySource,
        copiedSources: new Set(
          outputs.flatMap((output) => (output.kind === 'copy' ? [output.sourcePath] : [])),
        ),
      }),
    );
  }

  return { outputs, diagnostics };
}

// What the compiler actually emitted, indexed by the source each output came
// from. This is the evidence a declared loss's state is checked against.
interface EmittedIndex {
  generatedBySource: ReadonlyMap<string, readonly string[]>;
  copiedSources: ReadonlySet<string>;
}

// The body-pattern check in `render.ts` reads skill bodies only, so an agent's
// `tools:` filter or an `mcp__*` reference passes it unexamined and disappears
// from output with nothing said. Requiring a declared loss turns that silence
// into a compile error naming the construct.
//
// This half runs before any translation: an undeclared construct should stop
// the build without spending translator work first.
function gateUndeclaredLosses(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
): DetectionResult {
  const declared = new Set(packageInput.losses.map(({ construct }) => construct));
  const detection = detectClaudeOnlyConstructs({
    artifacts: packageInput.artifacts,
    resources: packageInput.resources,
    exemptDocuments: packageInput.exemptDocuments,
    target: input.publication.target,
  });
  const undeclared = detection.detected.filter(({ construct }) => !declared.has(construct));

  if (undeclared.length > 0) {
    const detail = undeclared
      .map(
        ({ construct, sourcePath, line, detail: why }) =>
          `  - ${construct}: ${siteOf(packageInput, sourcePath, line)} ${why}`,
      )
      .join('\n');
    throw new CompilationError(
      `package "${packageInput.id}" uses Claude-only constructs with no declared loss for target "${input.publication.target}":\n${detail}\n` +
        `Declare each under targets.${input.publication.target}.losses in ${packageInput.path}, or remove the construct.`,
    );
  }

  return detection;
}

// A declaration exists — but existing is not the same as being true. Compare
// each declared state against what the compiler emitted, then report.
function reportDeclaredLosses(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
  detection: DetectionResult,
  emitted: EmittedIndex,
): ProposedCompilationDiagnostic[] {
  const target = input.publication.target;
  const declared = new Map(packageInput.losses.map((loss) => [loss.construct, loss]));
  const diagnostics: ProposedCompilationDiagnostic[] = [];

  // A construct-shaped string the capability table does not classify is
  // reported, never gated. The old enumerated list was silent about everything
  // it did not name, so a construct Claude ships next shipped unexamined
  // (ndr:rm06pf); gating one we cannot confirm is lost would breach ndr:4nshwv.
  for (const { literal, sourcePath, line } of detection.unknown) {
    diagnostics.push({
      code: 'unclassified-construct',
      severity: 'warning',
      packageId: packageInput.id,
      message: `Unclassified Claude-only construct "${literal}" at ${siteOf(packageInput, sourcePath, line)} for target "${target}"; no capability-table entry covers it.`,
    });
  }

  // A translated construct never needed a declaration (ndr:4nshwv), but it is
  // still on the record. Without this the report cannot distinguish a construct
  // the target handles from one nothing ever looked at.
  for (const { literal, becomes, sourcePath, line } of detection.translated) {
    diagnostics.push({
      code: 'translated-construct',
      severity: 'note',
      packageId: packageInput.id,
      message: `Claude-only construct "${literal}" at ${siteOf(packageInput, sourcePath, line)} is translated to ${becomes} for target "${target}"; nothing is lost, so no declared loss is required.`,
    });
  }

  const occurrences = new Map<ClaudeOnlyConstruct, DetectedConstruct[]>();
  for (const occurrence of detection.detected) {
    const matched = occurrences.get(occurrence.construct) ?? [];
    matched.push(occurrence);
    occurrences.set(occurrence.construct, matched);
  }

  // Declaring a loss must not buy silence (ndr:62pj9p). Report each
  // declaration that actually matched, and name every occurrence it covers — a
  // note listing only the construct type gets less specific exactly as
  // detection coverage grows.
  for (const loss of declared.values()) {
    const matched = occurrences.get(loss.construct);
    if (!matched) continue;
    verifyDeclaredState(loss, matched, packageInput, target, emitted);
    diagnostics.push({
      code: 'declared-loss',
      severity: 'note',
      packageId: packageInput.id,
      message:
        `Claude-only construct "${loss.construct}" is ${loss.state} for target "${target}"${loss.note ? `: ${loss.note}` : '.'}` +
        ` Occurrences: ${matched.map(({ sourcePath, line }) => siteOf(packageInput, sourcePath, line)).join(', ')}.`,
    });
  }

  return diagnostics;
}

function verifyDeclaredState(
  loss: DeclaredLossDefinition,
  matched: readonly DetectedConstruct[],
  packageInput: CompilationPackage,
  target: TargetName,
  emitted: EmittedIndex,
): void {
  const observed = new Map<DeclaredLossDefinition['state'], string[]>();
  for (const occurrence of matched) {
    const state = observeState(occurrence, emitted);
    const sites = observed.get(state) ?? [];
    sites.push(siteOf(packageInput, occurrence.sourcePath, occurrence.line));
    observed.set(state, sites);
  }

  // A declaration is keyed by construct on the argument that the state is
  // uniform across its occurrences (ndr:k9r6pc). That decision names this exact
  // case as its falsifier, so say so rather than picking a winner.
  if (observed.size > 1) {
    const detail = [...observed]
      .map(([state, sites]) => `  - ${state}: ${sites.join(', ')}`)
      .join('\n');
    throw new CompilationError(
      `package "${packageInput.id}" declares Claude-only construct "${loss.construct}" as "${loss.state}" for target "${target}", but its occurrences did not share one state:\n${detail}\n` +
        `A declared loss covers every occurrence of its construct, so one state must hold for all of them.`,
    );
  }

  const [[state, sites]] = [...observed] as [[DeclaredLossDefinition['state'], string[]]];
  if (state === loss.state) return;
  throw new CompilationError(
    `package "${packageInput.id}" declares Claude-only construct "${loss.construct}" as "${loss.state}" for target "${target}", but the compiler emitted it as "${state}":\n` +
      sites.map((each) => `  - ${each}`).join('\n') +
      `\nCorrect the state under targets.${target}.losses in ${packageInput.path}, or change what the target emits.`,
  );
}

// The state is read off the output, never predicted from a table. A table would
// be one more unverified claim about what the target does, which is the defect
// this check exists to close.
function observeState(
  occurrence: DetectedConstruct,
  emitted: EmittedIndex,
): DeclaredLossDefinition['state'] {
  // A copied source reaches the target byte-identical, so whatever it contains
  // survives without reading the file back.
  if (emitted.copiedSources.has(occurrence.sourcePath)) return 'retained-unenforced';
  const contents = emitted.generatedBySource.get(occurrence.sourcePath) ?? [];
  // The source produced no output at all, so nothing in it reached the target.
  if (contents.length === 0) return 'stripped';
  return contents.some((content) => survives(occurrence.retention, content))
    ? 'retained-unenforced'
    : 'stripped';
}

function survives(retention: RetentionCheck, content: string): boolean {
  if (retention.kind === 'body-literal') return content.includes(retention.literal);
  try {
    return matter(content).data[retention.key] !== undefined;
  } catch {
    // Frontmatter the emitted output cannot parse carries no key we can claim
    // survived, and the artifact's own parser reports the malformation better.
    return false;
  }
}

function siteOf(packageInput: CompilationPackage, sourcePath: string, line?: number): string {
  const relative = relativePackageArtifactPath(packageInput.path, sourcePath);
  return line === undefined ? relative : `${relative}:${line}`;
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

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
