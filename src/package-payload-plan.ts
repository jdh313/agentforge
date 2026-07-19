import { dirname, posix, relative, sep } from 'node:path';
import type { PackageDefinition } from './definitions.ts';
import type { TargetName } from './types.ts';

export interface PackagePayload {
  sourcePath: string;
  destination: string;
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
  const shared = expandDeclaration(definition.payloads, relativeFiles);
  const plans: PackagePayloadPlans = {};

  for (const target of Object.keys(definition.targets).toSorted() as TargetName[]) {
    const targetEntries = expandDeclaration(definition.targets[target]?.payloads, relativeFiles);
    plans[target] = validatePlan(target, [...shared, ...targetEntries]);
  }

  return plans;
}

function expandDeclaration(
  declaration: PayloadDeclaration | undefined,
  files: ReadonlyMap<string, string>,
): PackagePayload[] {
  if (!declaration) return [];
  const globalExcludes = compileExcludes(declaration.exclude ?? []);
  return declaration.include.flatMap((include) =>
    expandInclude(include, files, [...globalExcludes, ...compileExcludes(include.exclude ?? [])]),
  );
}

function expandInclude(
  include: PayloadInclude,
  files: ReadonlyMap<string, string>,
  excludes: readonly Bun.Glob[],
): PackagePayload[] {
  validateSourcePattern(include.source, 'payload source');
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
    sourcePath: requireSourcePath(files, source),
    destination: destinationFor(include, source, sourceRoot, directory || glob),
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

function requireSourcePath(files: ReadonlyMap<string, string>, source: string): string {
  const sourcePath = files.get(source);
  if (!sourcePath) throw new PackagePayloadPlanError(`missing loaded payload source "${source}"`);
  return sourcePath;
}
