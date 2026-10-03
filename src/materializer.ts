import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, parse, resolve } from 'node:path';
import type { CompilationPlan, DesiredOutput, RootAnchoredOutput } from './compiler.ts';
import { isContainedPath } from './paths.ts';

export interface MaterializationResult {
  outputRoot: string;
  filesWritten: string[];
  // Absolute paths of marketplace-root-anchored outputs (root manifests).
  rootFilesWritten: string[];
}

/**
 * A managed destination (or, when it ends in `/`, a directory prefix) whose
 * parent chain is a symbolic link the caller resolved ahead of time. Writes land
 * in `target` instead of beneath the output root, so the link itself is never
 * replaced. The caller owns validating `target`; this layer re-resolves `link`
 * immediately before publishing and refuses if it no longer reaches `target`.
 */
export interface ManagedOutputAnchor {
  destination: string;
  link: string;
  target: string;
}

export interface ManagedOutputMaterializationOptions {
  /** Generated paths that may hold secrets and therefore must remain owner-readable only. */
  privateDestinations?: readonly string[];
  /** Resolved symbolic-link anchors; see `ManagedOutputAnchor`. */
  anchors?: readonly ManagedOutputAnchor[];
}

interface ManagedLocation {
  destination: string;
  staged: string;
  backup: string;
  parentRoot: string;
}

export class MaterializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MaterializationError';
  }
}

export function materializeCompilation(
  plan: CompilationPlan,
  outputRoot: string,
): MaterializationResult {
  const destinationRoot = resolve(outputRoot);
  if (destinationRoot === parse(destinationRoot).root) {
    throw new MaterializationError('refusing to materialize a marketplace at a filesystem root');
  }

  const parent = dirname(destinationRoot);
  const name = basename(destinationRoot);
  mkdirSync(parent, { recursive: true });
  const stagingRoot = mkdtempSync(resolve(parent, `.${name}.staging-`));

  try {
    for (const output of plan.outputs) {
      materializeOutput(output, stagingRoot);
    }
    publishStagedTree(stagingRoot, destinationRoot);
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new MaterializationError(
      `failed to materialize compilation "${plan.marketplaceId}" at ${destinationRoot}${detail}`,
      { cause },
    );
  } finally {
    if (existsSync(stagingRoot)) {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  }

  // Written after the staged tree publishes, and one file at a time: the
  // marketplace root is the user's repository, so a root manifest overwrites
  // exactly its own path and never stages, swaps, or prunes siblings.
  const rootFilesWritten = plan.rootOutputs.map((output) => materializeRootOutput(output));

  return {
    outputRoot: destinationRoot,
    filesWritten: plan.outputs.map(({ destination }) => destination),
    rootFilesWritten,
  };
}

/**
 * Publish only the paths named by a plan, preserving every sibling under the
 * output root. File-layout installs use this ownership mode (ndr:hjnabw).
 */
export function materializeCompilationOutputs(
  plan: CompilationPlan,
  outputRoot: string,
  options: ManagedOutputMaterializationOptions = {},
): MaterializationResult {
  return materializeCompilationOutputChanges(plan, outputRoot, [], options);
}

/**
 * Publish named managed files and remove named managed regular files as one
 * recoverable operation. Callers must have established ownership before
 * supplying a removal; this layer only owns staging and rollback.
 */
export function materializeCompilationOutputChanges(
  plan: CompilationPlan,
  outputRoot: string,
  removals: readonly string[],
  options: ManagedOutputMaterializationOptions = {},
): MaterializationResult {
  const destinationRoot = resolve(outputRoot);
  if (destinationRoot === parse(destinationRoot).root) {
    throw new MaterializationError('refusing to materialize managed files at a filesystem root');
  }

  const rootEntry = lstatSync(destinationRoot, { throwIfNoEntry: false });
  if (rootEntry && !rootEntry.isDirectory()) {
    throw new MaterializationError(
      `managed-file output root must be a directory: ${destinationRoot}`,
    );
  }

  const parent = dirname(destinationRoot);
  const name = basename(destinationRoot);
  mkdirSync(parent, { recursive: true });
  const stagingRoot = mkdtempSync(resolve(parent, `.${name}.staging-`));
  const backupRoot = mkdtempSync(resolve(parent, `.${name}.backup-`));
  // An anchored destination stages and backs up beside its resolved target, so
  // every rename stays on the target's own filesystem.
  const lanes = new Map<ManagedOutputAnchor, { staging: string; backup: string }>();
  const anchorLane = (anchor: ManagedOutputAnchor): { staging: string; backup: string } => {
    let lane = lanes.get(anchor);
    if (!lane) {
      const home = dirname(anchor.target);
      const label = basename(anchor.target);
      lane = {
        staging: mkdtempSync(resolve(home, `.${label}.agentforge-staging-`)),
        backup: mkdtempSync(resolve(home, `.${label}.agentforge-backup-`)),
      };
      lanes.set(anchor, lane);
    }
    return lane;
  };
  const locate = (proposed: string): ManagedLocation => {
    const anchor = options.anchors?.find(({ destination }) =>
      destination.endsWith('/') ? proposed.startsWith(destination) : proposed === destination,
    );
    if (!anchor) {
      const destination = resolve(destinationRoot, proposed);
      requireContainedDestination(destinationRoot, destination, proposed);
      return {
        destination,
        staged: resolve(stagingRoot, proposed),
        backup: resolve(backupRoot, proposed),
        parentRoot: destinationRoot,
      };
    }
    const lane = anchorLane(anchor);
    if (!anchor.destination.endsWith('/')) {
      const file = basename(anchor.target);
      return {
        destination: anchor.target,
        staged: resolve(lane.staging, file),
        backup: resolve(lane.backup, file),
        parentRoot: dirname(anchor.target),
      };
    }
    const rest = proposed.slice(anchor.destination.length);
    const destination = resolve(anchor.target, rest);
    requireContainedDestination(anchor.target, destination, proposed);
    return {
      destination,
      staged: resolve(lane.staging, rest),
      backup: resolve(lane.backup, rest),
      parentRoot: anchor.target,
    };
  };

  try {
    for (const output of plan.outputs) {
      writeStagedOutput(output, locate(output.destination).staged, options);
    }
    mkdirSync(destinationRoot, { recursive: true });
    for (const anchor of options.anchors ?? []) {
      let current: string | undefined;
      try {
        current = realpathSync(anchor.link);
      } catch {
        current = undefined;
      }
      if (current !== anchor.target) {
        throw new MaterializationError(
          `refusing to publish: ${anchor.link} no longer resolves to ${anchor.target}`,
        );
      }
    }
    publishManagedOutputChanges(plan.outputs, removals, locate);
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new MaterializationError(
      `failed to materialize compilation "${plan.marketplaceId}" at ${destinationRoot}${detail}`,
      { cause },
    );
  } finally {
    const roots = [
      stagingRoot,
      backupRoot,
      ...[...lanes.values()].flatMap(({ staging, backup }) => [staging, backup]),
    ];
    for (const root of roots) if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }

  return {
    outputRoot: destinationRoot,
    filesWritten: plan.outputs.map(({ destination }) => destination),
    rootFilesWritten: [],
  };
}

/** Atomically claim one managed path. Lifecycle callers use this as a scope lock. */
export function createManagedOutputLock(
  outputRoot: string,
  destination: string,
  content: string,
  options: { mode?: number } = {},
): void {
  const destinationRoot = resolve(outputRoot);
  if (destinationRoot === parse(destinationRoot).root)
    throw new MaterializationError('refusing to create a managed lock at a filesystem root');
  const path = resolve(destinationRoot, destination);
  requireContainedDestination(destinationRoot, path, destination);
  requireRegularParentPath(destinationRoot, dirname(path), destination);
  mkdirSync(dirname(path), { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'wx', options.mode ?? 0o644);
    writeFileSync(descriptor, content, 'utf8');
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new MaterializationError(
      `failed to claim managed lock ${JSON.stringify(destination)}${detail}`,
      {
        cause,
      },
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function materializeRootOutput(output: RootAnchoredOutput): string {
  const marketplaceRoot = dirname(resolve(output.provenance.marketplacePath));
  const destination = resolve(marketplaceRoot, output.destination);
  requireContainedPath(
    marketplaceRoot,
    destination,
    output.destination,
    'root output destination escapes the marketplace root',
  );
  try {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, output.content, 'utf8');
    chmodSync(destination, 0o644);
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new MaterializationError(
      `failed to write root manifest for publication "${output.provenance.publicationId}" at ${destination}${detail}`,
      { cause },
    );
  }
  return destination;
}

function materializeOutput(
  output: DesiredOutput,
  stagingRoot: string,
  options: ManagedOutputMaterializationOptions = {},
): void {
  const destination = resolve(stagingRoot, output.destination);
  requireContainedDestination(stagingRoot, destination, output.destination);
  writeStagedOutput(output, destination, options);
}

function writeStagedOutput(
  output: DesiredOutput,
  destination: string,
  options: ManagedOutputMaterializationOptions,
): void {
  mkdirSync(dirname(destination), { recursive: true });

  if (output.kind === 'generated') {
    writeFileSync(destination, output.content, 'utf8');
    chmodSync(
      destination,
      options.privateDestinations?.includes(output.destination) ? 0o600 : 0o644,
    );
    return;
  }
  if (output.kind === 'binary') {
    writeFileSync(destination, output.content);
    chmodSync(destination, 0o644);
    return;
  }
  const source =
    output.sourceRoot === undefined
      ? output.sourcePath
      : requireContainedRegularSource(output.sourceRoot, output.sourcePath);
  copyFileSync(source, destination);
  chmodSync(destination, output.executable ? 0o755 : 0o644);
}

function requireContainedRegularSource(sourceRoot: string, sourcePath: string): string {
  const root = resolve(sourceRoot);
  const source = resolve(sourcePath);
  requireContainedPath(root, source, sourcePath, 'payload source escapes the package root');

  let current = source;
  while (current !== root) {
    if (lstatSync(current).isSymbolicLink()) {
      throw new MaterializationError(
        `payload source must not be a symbolic link or traverse one: ${JSON.stringify(sourcePath)}`,
      );
    }
    current = dirname(current);
  }

  const canonicalRoot = realpathSync(root);
  const canonicalSource = realpathSync(source);
  requireContainedPath(
    canonicalRoot,
    canonicalSource,
    sourcePath,
    'payload source resolves outside the package root',
  );
  if (!lstatSync(canonicalSource).isFile()) {
    throw new MaterializationError(
      `payload source must be a regular file: ${JSON.stringify(sourcePath)}`,
    );
  }
  return canonicalSource;
}

function requireContainedPath(root: string, path: string, proposed: string, message: string): void {
  if (!isContainedPath(root, path)) {
    throw new MaterializationError(`${message}: ${JSON.stringify(proposed)}`);
  }
}

function requireContainedDestination(
  stagingRoot: string,
  destination: string,
  proposed: string,
): void {
  requireContainedPath(
    stagingRoot,
    destination,
    proposed,
    'output destination escapes the output root',
  );
}

function publishStagedTree(stagingRoot: string, destinationRoot: string): void {
  if (!existsSync(destinationRoot)) {
    renameSync(stagingRoot, destinationRoot);
    return;
  }

  const parent = dirname(destinationRoot);
  const name = basename(destinationRoot);
  const backupRoot = mkdtempSync(resolve(parent, `.${name}.backup-`));
  rmSync(backupRoot, { recursive: true });
  renameSync(destinationRoot, backupRoot);

  try {
    renameSync(stagingRoot, destinationRoot);
  } catch (cause) {
    renameSync(backupRoot, destinationRoot);
    throw cause;
  }

  rmSync(backupRoot, { recursive: true, force: true });
}

function publishManagedOutputChanges(
  outputs: readonly DesiredOutput[],
  removals: readonly string[],
  locate: (destination: string) => ManagedLocation,
): void {
  const published: Array<{ destination: string; backup?: string }> = [];
  try {
    const changes = [
      ...outputs.map((output) => ({ destination: output.destination, output })),
      ...removals.map((destination) => ({ destination })),
    ];
    if (new Set(changes.map(({ destination }) => destination)).size !== changes.length) {
      throw new MaterializationError('managed output changes must name each destination once');
    }
    for (const change of changes) {
      const location = locate(change.destination);
      const destination = location.destination;
      requireRegularParentPath(location.parentRoot, dirname(destination), change.destination);
      mkdirSync(dirname(destination), { recursive: true });

      const entry = lstatSync(destination, { throwIfNoEntry: false });
      if (entry && !entry.isFile()) {
        throw new MaterializationError(
          `managed output must replace only a regular file: ${JSON.stringify(change.destination)}`,
        );
      }

      let backup: string | undefined;
      if (entry) {
        backup = location.backup;
        mkdirSync(dirname(backup), { recursive: true });
        renameWithinFilesystem(destination, backup);
      }

      if ('output' in change) {
        try {
          renameWithinFilesystem(location.staged, destination);
        } catch (cause) {
          if (backup) renameSync(backup, destination);
          throw cause;
        }
      }
      published.push({ destination, ...(backup === undefined ? {} : { backup }) });
    }
  } catch (cause) {
    for (const item of published.toReversed()) {
      if (existsSync(item.destination)) rmSync(item.destination, { force: true });
      if (item.backup && existsSync(item.backup)) {
        mkdirSync(dirname(item.destination), { recursive: true });
        renameSync(item.backup, item.destination);
      }
    }
    throw cause;
  }
}

/** A cross-device rename is refused rather than copied: copying breaks atomic replacement. */
function renameWithinFilesystem(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EXDEV') {
      throw new MaterializationError(
        `refusing cross-device replacement of ${to}: staging and target are on different filesystems`,
        { cause },
      );
    }
    throw cause;
  }
}

function requireRegularParentPath(root: string, parent: string, proposed: string): void {
  let current = parent;
  while (current !== root) {
    const entry = lstatSync(current, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink() || (entry && !entry.isDirectory())) {
      throw new MaterializationError(
        `managed output parent must be a real directory: ${JSON.stringify(proposed)}`,
      );
    }
    current = dirname(current);
  }
}
