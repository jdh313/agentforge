import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import { TARGET_NAMES } from './types.ts';

export const PACKAGE_FILENAME = 'PACKAGE.yaml';
export const MARKETPLACE_FILENAME = 'MARKETPLACE.yaml';

const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated identifier');

const TargetName = z.enum(TARGET_NAMES);

type JsonValueT = string | number | boolean | null | JsonValueT[] | { [key: string]: JsonValueT };

const JsonValue: z.ZodType<JsonValueT> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValue), JsonObject]),
);

const JsonObject: z.ZodType<{ [key: string]: JsonValueT }> = z.record(z.string(), JsonValue);

const Author = z.strictObject({
  name: z.string().min(1),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});

export const PackageDefaults = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  author: Author.optional(),
  license: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
});

const PackageTarget = z.strictObject({
  overrides: PackageDefaults.partial().optional(),
  native: JsonObject.optional(),
});

const ArtifactPattern = z.strictObject({
  type: Slug,
  pattern: z.string().min(1),
});

export const CanonicalPackage = z
  .strictObject({
    schema: z.literal('agentforge.package/v1'),
    id: Slug,
    defaults: PackageDefaults,
    artifacts: z.array(ArtifactPattern).min(1),
    targets: z
      .partialRecord(TargetName, PackageTarget)
      .refine((targets) => Object.keys(targets).length > 0, 'declare at least one target'),
  })
  .superRefine((definition, context) => {
    reportDuplicates(
      definition.artifacts,
      ({ type, pattern }) => `${type}:${pattern}`,
      context,
      'artifact projection',
      ['artifacts'],
    );
  });

export type PackageDefinition = z.infer<typeof CanonicalPackage>;
export type PackageTargetDefinition = z.infer<typeof PackageTarget>;
export type NativeOverlay = z.infer<typeof JsonObject>;

const MarketplaceDefaults = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  owner: Author.optional(),
});

const Enrollment = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('all-compatible') }),
  z
    .strictObject({
      mode: z.literal('include'),
      packages: z.array(Slug).min(1),
    })
    .superRefine((enrollment, context) => {
      reportDuplicates(enrollment.packages, (packageId) => packageId, context, 'included package', [
        'packages',
      ]);
    }),
]);

const Publication = z.strictObject({
  id: Slug,
  target: TargetName,
  destination: z.string().min(1),
  enrollment: Enrollment,
  native: JsonObject.optional(),
});

export const CanonicalMarketplace = z
  .strictObject({
    schema: z.literal('agentforge.marketplace/v1'),
    id: Slug,
    defaults: MarketplaceDefaults,
    packages: z.array(z.string().min(1)).min(1),
    publications: z.array(Publication).min(1),
  })
  .superRefine((definition, context) => {
    reportDuplicates(definition.packages, (pattern) => pattern, context, 'package pattern', [
      'packages',
    ]);
    reportDuplicates(definition.publications, ({ id }) => id, context, 'publication id', [
      'publications',
    ]);
  });

export type MarketplaceDefinition = z.infer<typeof CanonicalMarketplace>;

export interface LoadedPackage {
  path: string;
  definition: PackageDefinition;
  artifacts: ReadonlyMap<string, readonly string[]>;
}

export interface LoadedMarketplace {
  path: string;
  definition: MarketplaceDefinition;
  packages: ReadonlyMap<string, LoadedPackage>;
}

export class DefinitionError extends Error {
  constructor(
    message: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`${path}: ${message}`, options);
    this.name = 'DefinitionError';
  }
}

export const parsePackageDefinition = (source: string, sourceName = PACKAGE_FILENAME) =>
  parseDefinition(source, sourceName, CanonicalPackage);

export const parseMarketplaceDefinition = (source: string, sourceName = MARKETPLACE_FILENAME) =>
  parseDefinition(source, sourceName, CanonicalMarketplace);

export async function loadPackageDefinition(path: string): Promise<LoadedPackage> {
  requireFilename(path, PACKAGE_FILENAME);
  const definition = parsePackageDefinition(await readFile(path, 'utf8'), path);
  const root = dirname(resolve(path));
  const artifacts = new Map<string, string[]>();

  for (const projection of definition.artifacts) {
    const matches = await expandPattern(root, projection.pattern);
    if (matches.length === 0) {
      throw new DefinitionError(
        `artifact pattern "${projection.pattern}" for type "${projection.type}" matched no files`,
        path,
      );
    }
    const current = artifacts.get(projection.type) ?? [];
    artifacts.set(projection.type, [...current, ...matches]);
  }

  return { path: resolve(path), definition, artifacts };
}

export async function loadMarketplaceDefinition(path: string): Promise<LoadedMarketplace> {
  requireFilename(path, MARKETPLACE_FILENAME);
  const definition = parseMarketplaceDefinition(await readFile(path, 'utf8'), path);
  const root = dirname(resolve(path));
  const packagePaths: string[] = [];

  for (const pattern of definition.packages) {
    const matches = await expandPattern(root, pattern);
    if (matches.length === 0) {
      throw new DefinitionError(`package pattern "${pattern}" matched no files`, path);
    }
    packagePaths.push(...matches);
  }

  const packages = new Map<string, LoadedPackage>();
  for (const packagePath of new Set(packagePaths)) {
    const loaded = await loadPackageDefinition(packagePath);
    const prior = packages.get(loaded.definition.id);
    if (prior) {
      throw new DefinitionError(
        `package id "${loaded.definition.id}" collides between ${prior.path} and ${loaded.path}`,
        path,
      );
    }
    packages.set(loaded.definition.id, loaded);
  }

  for (const publication of definition.publications) {
    if (publication.enrollment.mode !== 'include') continue;
    for (const packageId of publication.enrollment.packages) {
      const loaded = packages.get(packageId);
      if (!loaded) {
        throw new DefinitionError(
          `publication "${publication.id}" includes unknown package "${packageId}"`,
          path,
        );
      }
      if (!(publication.target in loaded.definition.targets)) {
        throw new DefinitionError(
          `publication "${publication.id}" includes package "${packageId}", which does not declare target "${publication.target}"`,
          path,
        );
      }
    }
  }

  return { path: resolve(path), definition, packages };
}

function parseDefinition<T>(source: string, sourceName: string, schema: z.ZodType<T>): T {
  let document: unknown;
  try {
    document = Bun.YAML.parse(source);
  } catch (cause) {
    throw new DefinitionError('invalid YAML', sourceName, { cause });
  }

  const result = schema.safeParse(document);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join('; ');
    throw new DefinitionError(`invalid definition (${details})`, sourceName, {
      cause: result.error,
    });
  }
  return result.data;
}

async function expandPattern(root: string, pattern: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const matches: string[] = [];
  for await (const match of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
    matches.push(resolve(match));
  }
  return matches.toSorted();
}

function requireFilename(path: string, expected: string): void {
  if (basename(path) !== expected) {
    throw new DefinitionError(`expected canonical filename ${expected}`, path);
  }
}

function reportDuplicates<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
  context: z.core.$RefinementCtx,
  label: string,
  path: PropertyKey[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        message: `duplicate ${label} "${key}"`,
        path,
      });
    }
    seen.add(key);
  }
}

function formatPath(path: PropertyKey[]): string {
  return path.length === 0 ? '<root>' : path.join('.');
}
