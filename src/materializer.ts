import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
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

  try {
    for (const output of plan.outputs) materializeOutput(output, stagingRoot);
    mkdirSync(destinationRoot, { recursive: true });
    publishManagedOutputs(plan.outputs, stagingRoot, destinationRoot, backupRoot);
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new MaterializationError(
      `failed to materialize compilation "${plan.marketplaceId}" at ${destinationRoot}${detail}`,
      { cause },
    );
  } finally {
    if (existsSync(stagingRoot)) rmSync(stagingRoot, { recursive: true, force: true });
    if (existsSync(backupRoot)) rmSync(backupRoot, { recursive: true, force: true });
  }

  return {
    outputRoot: destinationRoot,
    filesWritten: plan.outputs.map(({ destination }) => destination),
    rootFilesWritten: [],
  };
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

function materializeOutput(output: DesiredOutput, stagingRoot: string): void {
  const destination = resolve(stagingRoot, output.destination);
  requireContainedDestination(stagingRoot, destination, output.destination);
  mkdirSync(dirname(destination), { recursive: true });

  if (output.kind === 'generated') {
    writeFileSync(destination, output.content, 'utf8');
    chmodSync(destination, 0o644);
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
  if (output.executable !== undefined) {
    chmodSync(destination, output.executable ? 0o755 : 0o644);
  }
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

function publishManagedOutputs(
  outputs: readonly DesiredOutput[],
  stagingRoot: string,
  destinationRoot: string,
  backupRoot: string,
): void {
  const published: Array<{ destination: string; backup?: string }> = [];
  try {
    for (const output of outputs) {
      const destination = resolve(destinationRoot, output.destination);
      requireContainedDestination(destinationRoot, destination, output.destination);
      requireRegularParentPath(destinationRoot, dirname(destination), output.destination);
      mkdirSync(dirname(destination), { recursive: true });

      const entry = lstatSync(destination, { throwIfNoEntry: false });
      if (entry && !entry.isFile()) {
        throw new MaterializationError(
          `managed output must replace only a regular file: ${JSON.stringify(output.destination)}`,
        );
      }

      const staged = resolve(stagingRoot, output.destination);
      let backup: string | undefined;
      if (entry) {
        backup = resolve(backupRoot, output.destination);
        mkdirSync(dirname(backup), { recursive: true });
        renameSync(destination, backup);
      }

      try {
        renameSync(staged, destination);
      } catch (cause) {
        if (backup) renameSync(backup, destination);
        throw cause;
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
