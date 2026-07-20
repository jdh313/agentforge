import { lstatSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import type { PackageDefinition } from './definitions.ts';
import type { TargetName } from './types.ts';

export interface PackagePayload {
  sourcePath: string;
  destination: string;
  executable: boolean;
  collision?: 'override';
}

export type PackagePayloadPlans = Partial<Record<TargetName, readonly PackagePayload[]>>;

type PayloadDeclaration = NonNullable<PackageDefinition['payloads']>;
type PayloadInclude = PayloadDeclaration['include'][number];

export class PackagePayloadPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackagePayloadPlanError';
  }
}

export function normalizePackagePayloads(
  packagePath: string,
  definition: PackageDefinition,
  files: readonly string[],
): PackagePayloadPlans {
  const packageRoot = dirname(packagePath);
  const relativeFiles = new Map(
    files.map((sourcePath) => [portableRelative(packageRoot, sourcePath), sourcePath]),
  );
  const shared = expandDeclaration(definition.payloads, relativeFiles, packageRoot);
  const plans: PackagePayloadPlans = {};

  for (const target of Object.keys(definition.targets).toSorted() as TargetName[]) {
    const targetEntries = expandDeclaration(
      definition.targets[target]?.payloads,
      relativeFiles,
      packageRoot,
    );
    plans[target] = validatePlan(target, [...shared, ...targetEntries]);
  }

  return plans;
}

function expandDeclaration(
  declaration: PayloadDeclaration | undefined,
  files: ReadonlyMap<string, string>,
  packageRoot: string,
): PackagePayload[] {
  if (!declaration) return [];
  const globalExcludes = compileExcludes(declaration.exclude ?? []);
  return declaration.include.flatMap((include) =>
    expandInclude(include, files, packageRoot, [
      ...globalExcludes,
      ...compileExcludes(include.exclude ?? []),
    ]),
  );
}

function expandInclude(
  include: PayloadInclude,
  files: ReadonlyMap<string, string>,
  packageRoot: string,
  excludes: readonly Bun.Glob[],
): PackagePayload[] {
  validateSourcePattern(include.source, 'payload source');
  rejectSymlinkedSourcePattern(packageRoot, include.source);
  if (include.destination !== undefined) validateDestination(include.destination);

  const directory = include.source.endsWith('/');
  const glob = containsGlob(include.source);
  if (
    (directory || glob) &&
    include.destination !== undefined &&
    !include.destination.endsWith('/')
  ) {
    throw new PackagePayloadPlanError(
      `payload destination "${include.destination}" must end with "/" when the source is a directory or glob`,
    );
  }
  const pattern = directory ? `${include.source}**/*` : include.source;
  const matcher = new Bun.Glob(pattern);
  const matches = [...files.keys()]
    .filter((path) => matcher.match(path) && !excludes.some((exclude) => exclude.match(path)))
    .toSorted();

  if (matches.length === 0) {
    throw new PackagePayloadPlanError(`payload source "${include.source}" matched no files`);
  }

  const sourceRoot = directory ? include.source : staticGlobRoot(include.source);
  return matches.map((source) => ({
    ...inspectSource(files, source, packageRoot),
    destination: destinationFor(include, source, sourceRoot, directory || glob),
    ...(include.collision === undefined ? {} : { collision: include.collision }),
  }));
}

function destinationFor(
  include: PayloadInclude,
  source: string,
  sourceRoot: string,
  expandsMultiplePaths: boolean,
): string {
  if (include.destination === undefined) return source;
  if (!expandsMultiplePaths) {
    return include.destination.endsWith('/')
      ? posix.join(include.destination, posix.basename(source))
      : include.destination;
  }
  return posix.join(include.destination, posix.relative(sourceRoot || '.', source));
}

function staticGlobRoot(pattern: string): string {
  const segments = pattern.split('/');
  const firstDynamic = segments.findIndex(containsGlob);
  if (firstDynamic < 0) return posix.dirname(pattern);
  const root = segments.slice(0, firstDynamic).join('/');
  return root.length === 0 ? '.' : root;
}

function rejectSymlinkedSourcePattern(packageRoot: string, pattern: string): void {
  const candidate = pattern.endsWith('/')
    ? pattern.slice(0, -1)
    : containsGlob(pattern)
      ? staticGlobRoot(pattern)
      : pattern;
  if (candidate === '.' || candidate.length === 0) return;

  let current = packageRoot;
  for (const segment of candidate.split('/')) {
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new PackagePayloadPlanError(
          `payload source "${pattern}" must not be a symbolic link or traverse one`,
        );
      }
    } catch (cause) {
      if (cause instanceof PackagePayloadPlanError) throw cause;
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw cause;
    }
  }
}

function compileExcludes(patterns: readonly string[]): Bun.Glob[] {
  return patterns.map((pattern) => {
    validateSourcePattern(pattern, 'payload exclusion');
    return new Bun.Glob(pattern.endsWith('/') ? `${pattern}**/*` : pattern);
  });
}

function validatePlan(target: TargetName, entries: readonly PackagePayload[]): PackagePayload[] {
  const claimed = new Map<string, PackagePayload>();
  for (const entry of entries) {
    const key = entry.destination.normalize('NFC').toLowerCase();
    const prior = claimed.get(key);
    if (prior) {
      const destinations =
        prior.destination === entry.destination
          ? `destination "${entry.destination}"`
          : `destinations "${prior.destination}" and "${entry.destination}"`;
      throw new PackagePayloadPlanError(`payload ${destinations} collide for target "${target}"`);
    }
    claimed.set(key, entry);
  }
  return [...entries];
}

function validateSourcePattern(pattern: string, label: string): void {
  if (pattern.includes('\\'))
    throw new PackagePayloadPlanError(`${label} must use forward slashes`);
  if (pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern)) {
    throw new PackagePayloadPlanError(`${label} "${pattern}" must be package-relative`);
  }
  const segments = pattern.split('/').filter((segment, index, all) => {
    return !(segment.length === 0 && index === all.length - 1);
  });
  if (segments.includes('..')) {
    throw new PackagePayloadPlanError(`${label} "${pattern}" must not escape the package root`);
  }
  if (segments.some((segment) => segment.length === 0 || segment === '.')) {
    throw new PackagePayloadPlanError(`${label} "${pattern}" must be normalized`);
  }
}

function validateDestination(destination: string): void {
  if (containsGlob(destination)) {
    throw new PackagePayloadPlanError(
      `payload destination "${destination}" must not contain glob syntax`,
    );
  }
  if (containsControlCharacter(destination)) {
    throw new PackagePayloadPlanError(
      `payload destination "${destination}" must not contain control characters`,
    );
  }
  validateSourcePattern(destination, 'payload destination');
  const segments = destination.split('/').filter(Boolean);
  if (segments.some((segment) => segment.endsWith('.') || segment.endsWith(' '))) {
    throw new PackagePayloadPlanError(
      `payload destination "${destination}" has a segment ending with a dot or space`,
    );
  }
}

function containsGlob(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

function inspectSource(
  files: ReadonlyMap<string, string>,
  source: string,
  packageRoot: string,
): Pick<PackagePayload, 'sourcePath' | 'executable'> {
  const sourcePath = files.get(source);
  if (!sourcePath) throw new PackagePayloadPlanError(`missing loaded payload source "${source}"`);

  let current = dirname(sourcePath);
  const ancestors: string[] = [];
  while (current !== packageRoot && current !== dirname(current)) {
    ancestors.push(current);
    current = dirname(current);
  }
  const paths = [sourcePath, ...ancestors];
  if (paths.some((path) => lstatSync(path).isSymbolicLink())) {
    throw new PackagePayloadPlanError(
      `payload source "${source}" must not be a symbolic link or traverse one`,
    );
  }

  const status = lstatSync(sourcePath);
  if (!status.isFile()) {
    throw new PackagePayloadPlanError(`payload source "${source}" must resolve to a regular file`);
  }
  return { sourcePath, executable: (status.mode & 0o111) !== 0 };
}
