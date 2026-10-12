import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  CompilationError,
  type CompilationPlan,
  resolveOutputDestinations,
  resolvePackageInput,
} from './compiler.ts';
import type { LoadedPackage } from './definitions.ts';
import { MaterializationError, materializeCompilation } from './materializer.ts';
import { isContainedPath } from './paths.ts';
import type { TargetAdapter } from './target-adapter.ts';

/** Pure standalone compilation: the source definition itself is the provenance anchor. */
export function compilePackage(loaded: LoadedPackage, adapter: TargetAdapter): CompilationPlan {
  if (!adapter.package) {
    throw new CompilationError(
      `target ${adapter.name} does not support standalone package compilation`,
    );
  }
  const input = resolvePackageInput(loaded, adapter.name);
  const result = adapter.package.compilePackage(input);
  const provenance = {
    marketplacePath: loaded.path,
    publicationId: loaded.definition.id,
    packageId: loaded.definition.id,
  };
  const validateId = (packageId: string | undefined) => {
    if (packageId !== undefined && packageId !== input.id)
      throw new CompilationError(`adapter returned unknown package "${packageId}"`);
  };
  const diagnostics = (result.diagnostics ?? []).map(({ packageId, ...detail }) => {
    validateId(packageId);
    return { ...detail, target: adapter.name, provenance };
  });
  const outputs = resolveOutputDestinations(
    result.outputs.map(({ packageId, ...detail }) => {
      validateId(packageId);
      return { ...detail, target: adapter.name, provenance };
    }),
    diagnostics,
  ).toSorted((a, b) =>
    a.destination < b.destination ? -1 : a.destination > b.destination ? 1 : 0,
  );
  for (const output of outputs) {
    if (output.kind !== 'generated' || output.nativeDocument?.role !== 'package-manifest') continue;
    const handle = output.nativeDocument;
    const document: unknown = JSON.parse(output.content);
    handle.schema.parse(document);
    const issues =
      handle.validateResources?.(
        document,
        new Set(outputs.map(({ destination }) => destination)),
      ) ?? [];
    if (issues.length)
      throw new CompilationError(
        issues.map(({ path, message }) => `${path}: ${message}`).join('; '),
      );
  }
  return { marketplaceId: input.id, outputs, diagnostics, rootOutputs: [], redactions: [] };
}

/** Refuse lexical and physical aliases before the materializer creates its staging directory. */
export function materializePackage(plan: CompilationPlan, outputRoot: string): void {
  if (plan.rootOutputs.length)
    throw new MaterializationError('standalone package plans cannot write root-anchored outputs');
  const output = resolve(outputRoot);
  try {
    if (lstatSync(output).isSymbolicLink())
      throw new MaterializationError(`refusing symbolic link package output: ${output}`);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
  }
  const sources = new Set(
    plan.outputs.flatMap((item) => [
      dirname(resolve(item.provenance.marketplacePath)),
      ...(item.kind === 'copy' && item.sourceRoot ? [resolve(item.sourceRoot)] : []),
    ]),
  );
  for (const source of sources) {
    if (overlaps(source, output) || overlaps(physicalPath(source), physicalPath(output))) {
      throw new MaterializationError(
        `refusing source/output overlap between ${source} and ${output}`,
      );
    }
  }
  materializeCompilation(plan, output);
}

function overlaps(a: string, b: string): boolean {
  return a === b || isContainedPath(a, b) || isContainedPath(b, a);
}

// Resolve the closest existing ancestor, including symlinked parents of a new --out.
function physicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    const parent = dirname(path);
    if (parent === path) throw cause;
    return resolve(physicalPath(parent), basename(path));
  }
}
