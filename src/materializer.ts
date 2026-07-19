import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import type { CompilationPlan, DesiredOutput } from './compiler.ts';

export interface MaterializationResult {
  outputRoot: string;
  filesWritten: string[];
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
      `failed to materialize marketplace "${plan.marketplaceId}" at ${destinationRoot}${detail}`,
      { cause },
    );
  } finally {
    if (existsSync(stagingRoot)) {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  }

  return {
    outputRoot: destinationRoot,
    filesWritten: plan.outputs.map(({ destination }) => destination),
  };
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
  copyFileSync(output.sourcePath, destination);
  if (output.executable !== undefined) {
    chmodSync(destination, output.executable ? 0o755 : 0o644);
  }
}

function requireContainedDestination(
  stagingRoot: string,
  destination: string,
  proposed: string,
): void {
  const fromRoot = relative(stagingRoot, destination);
  if (
    fromRoot.length === 0 ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new MaterializationError(
      `output destination escapes the output root: ${JSON.stringify(proposed)}`,
    );
  }
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
