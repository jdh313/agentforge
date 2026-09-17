import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { buildArtifactPlan } from './artifact-plan.ts';
import type { CompilationPlan, DesiredOutput } from './compiler.ts';
import { loadArtifactProjection } from './render.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { getArtifactConfig } from './targets/registry.ts';
import { type ArtifactType, type InstallScope, TARGET_NAMES, type TargetName } from './types.ts';

export interface InstallCollisionInput {
  sourceDir: string;
  artifact: ArtifactType;
  target: TargetName;
  scope: InstallScope;
  homeDirectory: string;
  projectRoot: string;
  pluginRoot?: string;
  destinationRoot: string;
  ownership: 'snapshot' | 'planned-files';
  plan: CompilationPlan;
}

export interface InstallCollision {
  collidingTarget: TargetName;
  destinationRoot: string;
  // A short, cheap-to-compute factual note on what diverges between the two
  // projections (differing frontmatter keys and/or "body"). Omitted rather
  // than guessed when the canonical file cannot be located or parsed on
  // either side — this is not a diff engine, just the fields that were
  // already in hand.
  differs?: string;
}

/**
 * Stateless cross-target collision check. No manifest, no persisted state:
 * this compares what target `T` would write against what is already on
 * disk, and — only if those differ — against every OTHER target's
 * projection of the same source. A match there means the destination is
 * currently owned by a different target's output, not by an earlier
 * install of `T` itself (which would be an ordinary upgrade).
 *
 * Known and accepted blind spot: if the source changed between two installs
 * of different targets, the on-disk bytes may match neither projection and
 * this degrades to a silent overwrite. Closing that requires persistent
 * state, which this detector deliberately does not add.
 */
export function detectInstallCollision(input: InstallCollisionInput): InstallCollision | undefined {
  const {
    sourceDir,
    artifact,
    target,
    scope,
    homeDirectory,
    projectRoot,
    pluginRoot,
    destinationRoot,
    ownership,
    plan,
  } = input;
  if (!existsSync(destinationRoot)) return undefined;

  const ownBytes = bytesByDestination(plan.outputs);
  const onDisk =
    ownership === 'snapshot'
      ? readSnapshotBytes(destinationRoot)
      : readPathBytes(destinationRoot, [...ownBytes.keys()]);

  // Bytes on disk already match what this install would write: either a
  // fresh install or a no-op re-install of the same target. Not a collision.
  if (mapsEqual(onDisk, ownBytes)) return undefined;

  const artifactDef = ARTIFACT_DEFS[artifact];

  for (const candidate of TARGET_NAMES) {
    if (candidate === target) continue;
    const config = getArtifactConfig(candidate, artifact);
    if (!config) continue;

    const candidateLocation = config.installLocations[scope];
    if (!candidateLocation) continue;

    let candidateLocationRoot: string;
    try {
      candidateLocationRoot = candidateLocation({
        homeDirectory,
        projectRoot,
        ...(pluginRoot === undefined ? {} : { pluginRoot }),
      });
    } catch {
      // A location resolver that throws for this scope (e.g. plugin scope
      // with no plugin root) cannot resolve to this destination.
      continue;
    }

    // A target that writes somewhere else can never be the thing already on
    // disk at `destinationRoot`. File-layout artifacts write straight to
    // their location root, so this is decisive here; directory-layout
    // artifacts still need the candidate's own artifact name (below) before
    // the full destination is known.
    if (artifactDef.layout === 'file' && candidateLocationRoot !== destinationRoot) continue;

    let candidateOutputs: readonly DesiredOutput[];
    let candidateArtifactName: string;
    try {
      const projection = loadArtifactProjection({ sourceDir, target: candidate, artifact });
      const built = buildArtifactPlan({
        sourceDir,
        target: candidate,
        artifact,
        publicationId: 'install-collision-check',
        projection,
      });
      candidateOutputs = built.plan.outputs;
      candidateArtifactName = built.artifactName;
    } catch {
      // Target/artifact pairs that throw for this source (e.g. a construct
      // the candidate's native schema cannot express) are skipped, not
      // propagated — an unsupported projection cannot be the thing already
      // on disk.
      continue;
    }

    const candidateDestinationRoot =
      artifactDef.layout === 'directory'
        ? join(candidateLocationRoot, candidateArtifactName)
        : candidateLocationRoot;
    if (candidateDestinationRoot !== destinationRoot) continue;

    const candidateBytes = bytesByDestination(candidateOutputs);
    if (matchesOnDisk(onDisk, candidateBytes, ownership)) {
      return {
        collidingTarget: candidate,
        destinationRoot,
        differs: describeDifference(artifact, plan.outputs, candidateOutputs),
      };
    }
  }

  // Differs from what T would write, and from every other target's current
  // projection: an ordinary upgrade of T's own earlier output.
  return undefined;
}

function bytesByDestination(outputs: readonly DesiredOutput[]): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const output of outputs) map.set(output.destination, expectedBytes(output));
  return map;
}

function expectedBytes(output: DesiredOutput): Buffer {
  if (output.kind === 'generated') return Buffer.from(output.content, 'utf8');
  if (output.kind === 'binary') return Buffer.from(output.content);
  return readFileSync(output.sourcePath);
}

function readSnapshotBytes(root: string): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const relativePath of listFiles(root)) {
    map.set(relativePath, readFileSync(join(root, ...relativePath.split('/'))));
  }
  return map;
}

function readPathBytes(root: string, destinations: readonly string[]): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const destination of destinations) {
    const absolute = join(root, ...destination.split('/'));
    let entry: ReturnType<typeof lstatSync> | undefined;
    try {
      entry = lstatSync(absolute, { throwIfNoEntry: false });
    } catch {
      // `throwIfNoEntry: false` suppresses ENOENT only; a malformed path
      // (e.g. a path segment that is a regular file, not a directory) still
      // throws ENOTDIR. Treat it the same as "nothing there": not evidence
      // of a collision.
      continue;
    }
    if (entry?.isFile()) map.set(destination, readFileSync(absolute));
  }
  return map;
}

function tryReaddirSync(directory: string): Dirent<string>[] | undefined {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    // An unreadable directory (e.g. `directory` is itself a regular file)
    // contributes no files rather than throwing.
    return undefined;
  }
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of tryReaddirSync(directory) ?? []) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    }
  };
  visit(root);
  return files;
}

function mapsEqual(left: Map<string, Buffer>, right: Map<string, Buffer>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other || !value.equals(other)) return false;
  }
  return true;
}

/**
 * Whether `onDisk` could be the candidate target's own projection.
 *
 * `snapshot` ownership owns the whole destination directory, so a match
 * requires the full tree to agree (same file set, same bytes) — a partial
 * match would just as easily be an in-progress upgrade of the same target.
 *
 * `planned-files` ownership only ever writes the paths its own plan names,
 * preserving siblings, so only those paths are read into `onDisk` to begin
 * with; a match requires the candidate to write identical bytes at every one
 * of them. An empty `onDisk` carries no evidence either way (nothing to read
 * back, e.g. an irregular entry at the destination) and is never a match —
 * two empty maps are not each other's collision.
 */
function matchesOnDisk(
  onDisk: Map<string, Buffer>,
  candidateBytes: Map<string, Buffer>,
  ownership: 'snapshot' | 'planned-files',
): boolean {
  if (onDisk.size === 0) return false;
  if (ownership === 'snapshot') return mapsEqual(onDisk, candidateBytes);
  for (const [key, value] of onDisk) {
    const other = candidateBytes.get(key);
    if (!other || !value.equals(other)) return false;
  }
  return true;
}

/** The one output whose bytes are worth diffing for a human-readable note. */
export function canonicalOutput(
  artifact: ArtifactType,
  outputs: readonly DesiredOutput[],
): DesiredOutput | undefined {
  const artifactDef = ARTIFACT_DEFS[artifact];
  if (artifactDef.layout === 'directory') {
    return outputs.find(
      (output) =>
        output.kind === 'generated' && output.destination === artifactDef.canonicalFilename,
    );
  }
  // File layout ships exactly one managed destination per install.
  return outputs.find((output) => output.kind === 'generated');
}

function describeDifference(
  artifact: ArtifactType,
  ownOutputs: readonly DesiredOutput[],
  candidateOutputs: readonly DesiredOutput[],
): string | undefined {
  const own = canonicalOutput(artifact, ownOutputs);
  const candidate = canonicalOutput(artifact, candidateOutputs);
  if (!own || own.kind !== 'generated' || !candidate || candidate.kind !== 'generated') {
    return undefined;
  }

  try {
    const ownParsed = matter(own.content);
    const candidateParsed = matter(candidate.content);
    const keys = new Set([...Object.keys(ownParsed.data), ...Object.keys(candidateParsed.data)]);
    const differingKeys = [...keys]
      .filter(
        (key) => JSON.stringify(ownParsed.data[key]) !== JSON.stringify(candidateParsed.data[key]),
      )
      .toSorted();

    const parts: string[] = [];
    if (differingKeys.length > 0) {
      parts.push(`frontmatter ${differingKeys.map((key) => JSON.stringify(key)).join(', ')}`);
    }
    if (ownParsed.content !== candidateParsed.content) parts.push('body');
    return parts.length > 0 ? parts.join('; ') : undefined;
  } catch {
    return undefined;
  }
}
