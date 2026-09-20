import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import matter from 'gray-matter';
import JSZip from 'jszip';
import { agentExecutionFrom, type CanonicalAgentBehavior } from './agent-command.ts';
import { buildArtifactPlan } from './artifact-plan.ts';
import {
  findConstructShapes,
  type GatedSupport,
  supportFor,
  translationFor,
} from './capabilities.ts';
import { frontmatterOffset } from './compatibility.ts';
import type { CompilationPlan, DesiredOutput, SourceLocation } from './compiler.ts';
import { deepMerge } from './deep-merge.ts';
import { acceptedFrontmatterKeys } from './frontmatter.ts';
import { materializeCompilation } from './materializer.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { getArtifactConfig } from './targets/registry.ts';
import type {
  ArtifactType,
  ConstructSurface,
  InstallScope,
  RenderResult,
  TargetName,
  Warning,
} from './types.ts';

export interface RenderOptions {
  sourceDir: string;
  target: TargetName;
  outDir: string;
  artifact?: ArtifactType;
}

export interface ArtifactProjectionOptions {
  sourcePath: string;
  source: string;
  target: TargetName;
  artifact: ArtifactType;
  resourcePaths?: readonly string[];
  installScope?: InstallScope;
  // Frontmatter keys the package declared authoring-layer. They belong to the
  // source repo, not to any runtime, so they are removed before projection
  // begins — every downstream step then sees frontmatter that never carried
  // them, and no step reports them. Canonical source is untouched, which is the
  // point: the tooling that reads and rewrites these keys works against the
  // repo, not against published output.
  authoringKeys?: ReadonlySet<string>;
}

export interface LoadArtifactProjectionOptions {
  sourceDir: string;
  target: TargetName;
  artifact: ArtifactType;
  installScope?: InstallScope;
}

export interface ProjectedResource {
  sourcePath: string;
  relativePath: string;
}

export interface ProjectedGeneratedFile {
  relativePath: string;
  content: string;
}

export interface ArtifactProjection {
  artifactName: string;
  content: string;
  generatedFiles: readonly ProjectedGeneratedFile[];
  resources: readonly ProjectedResource[];
  warnings: readonly Warning[];
  // The canonical filename extension, including the leading dot. Absent means
  // the artifact's default layout extension (`.md`); a target/artifact pair
  // with a `nativeDocument` sets its own here instead.
  extension?: string;
}

/**
 * Give one pure projection its paths without touching the filesystem.
 * Standalone rendering and package compilation consume this same shape; the
 * caller decides which root owns the relative destinations.
 */
export { buildArtifactOutputs } from './artifact-plan.ts';

// The enumerated pattern table that used to live here is gone. It named eight
// literals and was silent about everything else, so whatever Claude shipped next
// passed unexamined. Both this path and marketplace compilation now resolve the
// same construct shapes against the same capability table; only the reporting
// differs, because a standalone render has no PACKAGE.yaml to declare a loss in
// and so can only warn.
//
// `unsupported` and `unknown` are kept apart. A confirmed loss and an
// unrecognized shape warrant different words — collapsing them would report an
// ordinary `$PATH` as a Claude-only feature the target is about to drop.
interface BodyConstructOccurrences {
  literals: string[];
  locations: SourceLocation[];
}

const detectClaudeOnlyBodyFeatures = (
  body: string,
  // Newlines gray-matter's frontmatter block consumed, so a body-relative
  // `shape.line` can be reported as file-relative — the same recovery
  // `bodyOf` in `src/compatibility.ts` does for the marketplace path.
  lineOffset: number,
  sourcePath: string,
  target: TargetName,
  surface: ConstructSurface,
): { lost: BodyConstructOccurrences; unclassified: BodyConstructOccurrences } => {
  const lost = new Set<string>();
  const unclassified = new Set<string>();
  // Positions per occurrence, kept separate from the deduped literal sets
  // above: the message still names each lost literal once, but a warning
  // recorded against one literal for the whole file lost every repeat's own
  // location. `findConstructShapes` already yields shapes in line order, so
  // these arrive sorted too. Paired with its own literal set structurally
  // (rather than as four parallel top-level fields) so the two can no longer
  // drift out of lockstep (Fibery #121).
  const lostLocations: SourceLocation[] = [];
  const unclassifiedLocations: SourceLocation[] = [];
  for (const shape of findConstructShapes(body)) {
    const support = supportFor(target, surface, shape.token);
    const line = shape.line + lineOffset;
    if (support === 'unsupported') {
      lost.add(shape.literal);
      lostLocations.push({ path: sourcePath, line });
    } else if (support === 'unknown') {
      unclassified.add(shape.literal);
      unclassifiedLocations.push({ path: sourcePath, line });
    }
  }
  return {
    lost: { literals: [...lost].toSorted(), locations: lostLocations },
    unclassified: { literals: [...unclassified].toSorted(), locations: unclassifiedLocations },
  };
};

// Body constructs this (target, surface) supports only under a typed condition.
// Grouped per condition rather than per literal, so one warning states one
// actionable gate once rather than repeating it for every token (ndr:k58f71).
const detectGatedBodyConstructs = (
  body: string,
  target: TargetName,
  surface: ConstructSurface,
): { literals: string[]; support: GatedSupport }[] => {
  const byCondition = new Map<string, { literals: Set<string>; support: GatedSupport }>();
  for (const shape of findConstructShapes(body)) {
    const support = supportFor(target, surface, shape.token);
    if (typeof support !== 'object' || support.state !== 'gated') continue;
    const key = JSON.stringify(support.condition);
    const entry = byCondition.get(key) ?? { literals: new Set<string>(), support };
    entry.literals.add(shape.literal);
    byCondition.set(key, entry);
  }
  return [...byCondition.values()].map(({ literals, support }) => ({
    literals: [...literals].toSorted(),
    support,
  }));
};

const pickKeys = (
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) out[key] = obj[key];
  }
  return out;
};

const omitKey = <T extends Record<string, unknown>>(
  obj: T,
  key: string,
): Record<string, unknown> => {
  const { [key]: _, ...rest } = obj;
  return rest;
};

const omitKeys = (
  obj: Record<string, unknown>,
  omitted: ReadonlySet<string>,
): Record<string, unknown> => {
  if (omitted.size === 0) return obj;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!omitted.has(key)) out[key] = obj[key];
  }
  return out;
};

export const projectArtifact = (opts: ArtifactProjectionOptions): ArtifactProjection => {
  const {
    sourcePath,
    source,
    target,
    artifact,
    resourcePaths = [],
    installScope,
    authoringKeys = new Set<string>(),
  } = opts;
  const artifactDef = ARTIFACT_DEFS[artifact];
  const artifactConfig = getArtifactConfig(target, artifact);
  if (!artifactConfig) {
    throw new Error(`target ${target} does not support artifact ${artifact}`);
  }

  const parsed = matter(source);
  const data = artifactDef.canonicalSchema.parse(parsed.data) as Record<string, unknown> & {
    targets?: Record<string, unknown>;
  };
  const canonicalBody = parsed.content;
  // Same recovery `bodyOf` in `src/compatibility.ts` does, via the shared
  // helper: gray-matter strips the frontmatter block, so a line found in
  // `canonicalBody` is off by however many newlines that block consumed.
  const frontmatterLineOffset = frontmatterOffset(source, canonicalBody);

  // Authoring-layer keys are removed here, before anything else looks at the
  // frontmatter, so no later step can report or emit one. Stripping a declared
  // key is not a loss to record (ndr:4nshwv) — the author already said it was
  // never addressed to a runtime — so this is deliberately silent, and
  // deliberately not `unrecognized-frontmatter-key`, which reports a key nobody
  // has ruled on.
  const { targets, ...declaredFrontmatter } = data;
  const canonicalFrontmatter = omitKeys(declaredFrontmatter, authoringKeys);
  const overrideRaw = (targets?.[target] as Record<string, unknown> | undefined) ?? {};
  const overrideBody =
    typeof (overrideRaw as { body?: unknown }).body === 'string'
      ? (overrideRaw as { body: string }).body
      : undefined;
  const overrideFields = omitKeys(
    omitKey(overrideRaw as Record<string, unknown>, 'body'),
    authoringKeys,
  );

  const merged = deepMerge(canonicalFrontmatter as Record<string, unknown>, overrideFields);
  const body = overrideBody ?? canonicalBody;
  const acceptedKeys = acceptedFrontmatterKeys(target, artifact);
  // A key the artifact's schema does not enumerate used to be gone by now — zod
  // discarded it at parse, so there was nothing here to route or report. The
  // canonical schemas are loose, so the key survives to this point and the
  // target says what happens to it.
  const unrecognized = Object.keys(merged)
    .filter((key) => !artifactDef.canonicalKeys.has(key))
    .toSorted();
  const filtered = pickKeys(merged, acceptedKeys);
  artifactConfig.outputFrontmatterSchema.parse(filtered);

  const warnings: Warning[] = [];
  // Reported on every target, Claude included: retaining a key agentforge does
  // not recognize is a pass-through, not an endorsement, and silence would make
  // "we understand this key" and "we have never heard of it" look identical in
  // output. Never gated — an unrecognized key is not a confirmed loss
  // (ndr:szdn5s), so it warns and compilation proceeds.
  if (unrecognized.length > 0) {
    warnings.push({
      kind: 'unrecognized-frontmatter-key',
      target,
      detail: `${unrecognized.join(', ')} not in the canonical schema; dropped for ${target}`,
    });
  }
  if (target !== 'claude') {
    // A key the target translates into a native artifact is not stripped, so it
    // does not belong in a stripped warning. The capability table is asked
    // rather than the answer being restated as a condition here.
    const claudeOnlyPresent = Object.keys(canonicalFrontmatter).filter(
      (key) =>
        artifactDef.canonicalKeys.has(key) &&
        !acceptedKeys.has(key) &&
        supportFor(target, artifactConfig.surface, key) !== 'translated',
    );
    if (claudeOnlyPresent.length > 0) {
      warnings.push({
        kind: 'claude-only-frontmatter-stripped',
        target,
        detail: `stripped ${claudeOnlyPresent.join(', ')}`,
      });
    }
    if (overrideBody === undefined) {
      const { lost, unclassified } = detectClaudeOnlyBodyFeatures(
        canonicalBody,
        frontmatterLineOffset,
        sourcePath,
        target,
        artifactConfig.surface,
      );
      if (lost.literals.length > 0) {
        warnings.push({
          kind: 'claude-only-body-feature',
          target,
          detail: `body uses ${lost.literals.join(', ')} but no targets.${target}.body override`,
          locations: lost.locations,
        });
      }
      if (unclassified.literals.length > 0) {
        warnings.push({
          kind: 'unclassified-body-construct',
          target,
          detail: `body uses ${unclassified.literals.join(', ')}, which no capability-table entry covers`,
          locations: unclassified.locations,
        });
      }
    }
  }

  // Outside the `target !== 'claude'` gate on purpose. What this reports is a
  // typed capability condition, not the target refusing a construct. The first
  // real row is Claude's `${CLAUDE_PLUGIN_ROOT}` install-scope gate, so it must
  // fire for the source dialect without turning into `claude-only-body-feature`
  // or asserting ownership (ndr:728mf7).
  //
  // Phrased as a condition rather than an unconditional target outcome. A
  // context-aware install may suppress a satisfied condition, but the
  // capability itself remains gated and outside the declared-loss path
  // (ndr:k58f71).
  if (overrideBody === undefined) {
    const gated = detectGatedBodyConstructs(canonicalBody, target, artifactConfig.surface);
    for (const { literals, support } of gated) {
      const { condition } = support;
      if (
        condition.kind === 'install-scope' &&
        installScope !== undefined &&
        condition.resolvedAt.includes(installScope)
      ) {
        continue;
      }
      warnings.push({
        kind: 'construct-support-gated',
        target,
        detail:
          condition.kind === 'install-scope'
            ? `body uses ${literals.join(', ')}, substituted only for ${condition.resolvedAt.join('/')}-scope ${artifact}s; installed at any other scope it reaches the model as literal text`
            : `body uses ${literals.join(', ')}, supported only when consumer configuration option ${condition.option} is enabled`,
      });
    }
  }

  const artifactName =
    typeof (filtered as { name?: unknown }).name === 'string' &&
    (filtered as { name: string }).name.length > 0
      ? (filtered as { name: string }).name
      : nameFromSourceDir(dirname(sourcePath));

  if (artifactConfig.nativeDocument) {
    const behavior = toCanonicalAgentBehavior(artifactName, merged, overrideFields, body, source);
    const native = artifactConfig.nativeDocument.serialize(behavior, { sourcePath });
    return {
      artifactName,
      content: native.content,
      generatedFiles: [],
      resources: [],
      warnings: [...warnings, ...native.warnings],
      extension: artifactConfig.nativeDocument.extension,
    };
  }

  const rendered = matter.stringify(body, filtered);
  // Where the translation lands is the capability table's answer, so the note
  // that reports it and the file that satisfies it cannot drift apart. Only the
  // emitted content is this translator's own business.
  const invocationPolicyPath =
    artifact === 'skill' && merged['disable-model-invocation'] === true
      ? translationFor(target, artifactConfig.surface, 'disable-model-invocation')
      : undefined;
  const generatedFiles =
    invocationPolicyPath === undefined
      ? []
      : [
          {
            relativePath: invocationPolicyPath,
            content: 'policy:\n  allow_implicit_invocation: false\n',
          },
        ];
  const sourceDir = dirname(sourcePath);
  const installIncludesResources =
    installScope === undefined ||
    artifactConfig.resourceInstallScopes === undefined ||
    artifactConfig.resourceInstallScopes.has(installScope);
  const resources = resourcePaths
    .map((resourcePath) => ({
      sourcePath: resourcePath,
      relativePath: relative(sourceDir, resourcePath).split('\\').join('/'),
    }))
    .filter(({ relativePath }) => {
      const [subdir] = relativePath.split('/');
      return (
        installIncludesResources &&
        subdir !== undefined &&
        artifactConfig.resourceSubdirs.has(subdir)
      );
    })
    .toSorted((left, right) => {
      if (left.relativePath < right.relativePath) return -1;
      if (left.relativePath > right.relativePath) return 1;
      return 0;
    });

  return { artifactName, content: rendered, generatedFiles, resources, warnings };
};

// Builds the same canonical shape the package-agent parser produces
// (`src/agent-command.ts`), from the already-merged leaf frontmatter and body,
// so a native-document target consumes one agent behavior model rather than a
// second, leaf-specific representation.
//
// `model` is the one field deliberately NOT read from `merged`: a shared
// top-level `model:` is a Claude-shaped alias (Claude's own model catalog),
// and a native-document target's model namespace is its own. Only an
// explicit `targets.<name>.model` names this target, so `overrideFields` —
// never the merged value — is what a native document may read; a bare
// top-level `model:` with no matching override still surfaces as a
// `claude-only-frontmatter-stripped` warning through the existing
// acceptance-table path, same as any other Claude-only key.
function toCanonicalAgentBehavior(
  name: string,
  merged: Record<string, unknown>,
  overrideFields: Record<string, unknown>,
  body: string,
  source: string,
): CanonicalAgentBehavior {
  return {
    kind: 'agent',
    name,
    description: typeof merged.description === 'string' ? merged.description : '',
    instructions: body,
    source,
    sourceFrontmatter: merged,
    execution: agentExecutionFrom({
      ...merged,
      model: overrideFields.model,
    }),
  };
}

export function loadArtifactProjection(opts: LoadArtifactProjectionOptions): ArtifactProjection {
  const { sourceDir, target, artifact, installScope } = opts;
  const artifactDef = ARTIFACT_DEFS[artifact];
  const canonicalFile = join(sourceDir, artifactDef.canonicalFilename);
  if (!existsSync(canonicalFile)) {
    throw new Error(`${artifactDef.canonicalFilename} not found at ${canonicalFile}`);
  }
  const artifactConfig = getArtifactConfig(target, artifact);
  if (!artifactConfig) {
    throw new Error(`target ${target} does not support artifact ${artifact}`);
  }
  const resourcePaths = [...artifactConfig.resourceSubdirs].flatMap((subdir) => {
    const resourceDir = join(sourceDir, subdir);
    return existsSync(resourceDir)
      ? walkFiles(resourceDir).map((path) => join(resourceDir, path))
      : [];
  });
  return projectArtifact({
    sourcePath: canonicalFile,
    source: readFileSync(canonicalFile, 'utf-8'),
    target,
    artifact,
    resourcePaths,
    ...(installScope === undefined ? {} : { installScope }),
  });
}

/**
 * Render through the same plan and materializer used by compile and install.
 * Bundles materialize their directory tree first, derive the archive from those
 * published bytes, and publish the archive through a second plan.
 */
export const render = async (opts: RenderOptions): Promise<RenderResult> => {
  const { sourceDir, target, outDir, artifact = 'skill' } = opts;
  const artifactConfig = getArtifactConfig(target, artifact);
  if (!artifactConfig) {
    throw new Error(`target ${target} does not support artifact ${artifact}`);
  }
  const projection = loadArtifactProjection({ sourceDir, target, artifact });
  const isZip = artifactConfig.bundle === 'zip';
  const planned = buildArtifactPlan({
    sourceDir,
    target,
    artifact,
    publicationId: 'render',
    projection,
    ...(isZip ? { prefix: projection.artifactName } : {}),
  });

  if (!isZip) {
    materializeCompilation(planned.plan, outDir);
    return {
      outputPath: join(outDir, planned.canonicalDestination),
      resourcesCopied: planned.resourcesCopied,
      warnings: planned.warnings,
    };
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-bundle-'));
  try {
    const publishedTree = join(temporaryRoot, 'published');
    materializeCompilation(planned.plan, publishedTree);

    const archiveName = `${projection.artifactName}.zip`;
    materializeCompilation(
      singleBinaryOutputPlan(
        archiveName,
        await zipPublishedTree(publishedTree),
        target,
        planned.plan,
      ),
      outDir,
    );

    return {
      outputPath: join(outDir, archiveName),
      resourcesCopied: planned.resourcesCopied,
      warnings: planned.warnings,
    };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

async function zipPublishedTree(publishedTree: string): Promise<Buffer> {
  const zip = new JSZip();
  const files = walkFiles(publishedTree);
  const directories = new Set<string>();
  for (const relativePath of files) {
    let directory = dirname(relativePath);
    while (directory !== '.') {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  const zipEpoch = new Date(Date.UTC(1980, 0, 1));
  for (const directory of [...directories].toSorted()) {
    zip.file(`${directory}/`, null, {
      createFolders: false,
      date: zipEpoch,
      dir: true,
      unixPermissions: 0o755,
    });
  }
  for (const relativePath of files) {
    const absolutePath = join(publishedTree, relativePath);
    zip.file(relativePath, readFileSync(absolutePath), {
      createFolders: false,
      date: zipEpoch,
      unixPermissions: statSync(absolutePath).mode & 0o777,
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

function singleBinaryOutputPlan(
  archiveName: string,
  content: Uint8Array,
  target: TargetName,
  directoryPlan: CompilationPlan,
): CompilationPlan {
  const output: DesiredOutput = {
    kind: 'binary',
    producer: 'generated',
    destination: archiveName,
    content,
    target,
    provenance: {
      marketplacePath: directoryPlan.outputs[0]?.provenance.marketplacePath ?? archiveName,
      publicationId: 'render',
    },
  };
  return {
    marketplaceId: 'render',
    outputs: [output],
    diagnostics: directoryPlan.diagnostics,
    rootOutputs: [],
    redactions: [],
  };
}

const walkFiles = (root: string): string[] => {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        visit(abs);
      } else {
        out.push(relative(root, abs));
      }
    }
  };
  visit(root);
  return out.toSorted();
};

export const nameFromSourceDir = (sourceDir: string): string => basename(sourceDir);
