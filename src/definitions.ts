import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import {
  normalizePackagePayloads,
  PackagePayloadPlanError,
  type PackagePayloadPlans,
} from './package-payload-plan.ts';
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

const PayloadInclude = z.strictObject({
  source: z.string().min(1),
  destination: z.string().min(1).optional(),
  exclude: z.array(z.string().min(1)).optional(),
  collision: z.literal('override').optional(),
});

const PayloadDeclaration = z.strictObject({
  include: z.array(PayloadInclude).min(1),
  exclude: z.array(z.string().min(1)).optional(),
});

// Constructs that carry meaning on Claude, have no equivalent on another
// target, and would otherwise be dropped with nothing reported. Constructs that
// are faithfully translated (a folded hook `args`) or already reported are not
// listed here — a declared loss gates silent loss, not every divergence.
export const CLAUDE_ONLY_CONSTRUCTS = [
  'agent-tools-filter',
  'command-tools-filter',
  'mcp-tool-reference',
  // Body constructs. Previously these were warning-only and undeclarable, so a
  // body feature that was a hard silent loss could not be declared at all — the
  // one condition ndr:4nshwv says must.
  'body-template-variable',
  'body-shell-injection',
  'body-file-reference',
] as const;

export type ClaudeOnlyConstruct = (typeof CLAUDE_ONLY_CONSTRUCTS)[number];

const DeclaredLoss = z.strictObject({
  construct: z.enum(CLAUDE_ONLY_CONSTRUCTS),
  state: z.enum(['stripped', 'retained-unenforced']),
  note: z.string().min(1).optional(),
});

const PackageTarget = z
  .strictObject({
    overrides: PackageDefaults.partial().optional(),
    native: JsonObject.optional(),
    payloads: PayloadDeclaration.optional(),
    losses: z.array(DeclaredLoss).min(1).optional(),
  })
  .superRefine((target, context) => {
    reportDuplicates(target.losses ?? [], ({ construct }) => construct, context, 'declared loss', [
      'losses',
    ]);
  });

export type DeclaredLossDefinition = z.infer<typeof DeclaredLoss>;

const ArtifactPattern = z.strictObject({
  type: Slug,
  pattern: z.string().min(1),
});

// Document class is orthogonal to artifact type: it says whether a file's
// Claude-only constructs are being *described* or *invoked*, not whether the
// file projects to a target. Fusing the two — declaring an exempt file as an
// artifact of type `reference` — would emit a spurious
// `unsupported-artifact-projection` (ndr:2vv99y) for a file that was never
// meant to be translated.
//
// Both classes are exempt from body scanning; the name records why, so a reader
// can tell a gotcha reference from a connectivity probe (ndr:grjvxz).
const DocumentClass = z.strictObject({
  class: z.enum(['reference', 'diagnostic']),
  pattern: z.string().min(1),
});

// Frontmatter keys that belong to the authoring layer of the source repo and
// are not addressed to any runtime. `upstream:` is the motivating case: it
// carries adaptation provenance that a repo-local skill reads and *rewrites* in
// canonical source, so a copy of it in published output is inert at best and
// misleading at worst.
//
// Declared rather than inferred, for the same reason `documents` is: these are
// repo-local conventions whose vocabulary the compiler has no business knowing,
// and guessing which unrecognized keys are authoring-layer is exactly the kind
// of intent-guessing that declaration exists to avoid. A declared key is
// stripped from every target and reported nowhere — a deliberate strip is not a
// loss, and only a confirmed loss is worth recording (ndr:4nshwv).
const AuthoringKey = z.string().min(1);

export const CanonicalPackage = z
  .strictObject({
    schema: z.literal('agentforge.package/v1'),
    id: Slug,
    defaults: PackageDefaults,
    artifacts: z.array(ArtifactPattern).min(1),
    documents: z.array(DocumentClass).min(1).optional(),
    'authoring-keys': z.array(AuthoringKey).min(1).optional(),
    payloads: PayloadDeclaration.optional(),
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
    reportDuplicates(definition['authoring-keys'] ?? [], (key) => key, context, 'authoring key', [
      'authoring-keys',
    ]);
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

// A second copy of the publication's marketplace registry, written at the
// marketplace root with every plugin source rewritten to point into the
// compiled output. Claude Code's `plugin marketplace add owner/repo` reads only
// `<clone-root>/.claude-plugin/marketplace.json` and resolves each plugin
// source against the directory holding `.claude-plugin/`, so a registry that
// lives only under `<out>/<publication>/` cannot be installed from a clone.
// Opt-in: the nested copy stays byte-identical, because a local-directory
// install (`claude plugin marketplace add ./marketplaces/claude`) resolves
// against the nested root and must keep working.
const RootManifest = z.boolean();

const Publication = z.strictObject({
  id: Slug,
  target: TargetName,
  destination: z.string().min(1),
  enrollment: Enrollment,
  native: JsonObject.optional(),
  'root-manifest': RootManifest.default(false),
});

export type PublicationDefinition = z.infer<typeof Publication>;

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
  artifacts: ReadonlyMap<string, readonly LoadedArtifact[]>;
  files: readonly string[];
  resources: readonly LoadedArtifact[];
  // Absolute paths of files declared reference-or-diagnostic. Their Claude-only
  // constructs are documentation about Claude, not instructions to a model, so
  // they are exempt from body scanning.
  exemptDocuments: ReadonlySet<string>;
  payloads: PackagePayloadPlans;
}

export interface LoadedArtifact {
  path: string;
  content: string;
}

// Resource files reach a target's model context verbatim, so a Claude-only
// construct in `references/api.md` misleads exactly as much as one in SKILL.md.
// Their text is read here, at load time, so compilation stays free of
// filesystem I/O (ndr:cp4rfn).
const RESOURCE_SUBDIRS = ['references', 'scripts', 'assets'];
const TEXT_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.sh',
  '.bash',
  '.py',
  '.yaml',
  '.yml',
  '.json',
];

export function isResourcePath(root: string, path: string): boolean {
  const relative = portableRelativePath(root, path);
  const segments = relative.split('/');
  if (
    !segments.some(
      (segment, index) => index < segments.length - 1 && RESOURCE_SUBDIRS.includes(segment),
    )
  ) {
    return false;
  }
  return TEXT_EXTENSIONS.some((extension) => relative.toLowerCase().endsWith(extension));
}

// Exported for the compilation report, which relativizes source paths against
// the marketplace root. Same rule deliberately: a path outside the root is left
// absolute rather than walked back with `../`, so a report never claims a file
// lives somewhere it does not.
export function portableRelativePath(root: string, path: string): string {
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(normalizedRoot) ? path.slice(normalizedRoot.length) : path;
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
  const artifacts = new Map<string, LoadedArtifact[]>();

  for (const projection of definition.artifacts) {
    const matches = await expandPattern(root, projection.pattern);
    if (matches.length === 0) {
      throw new DefinitionError(
        `artifact pattern "${projection.pattern}" for type "${projection.type}" matched no files`,
        path,
      );
    }
    const current = artifacts.get(projection.type) ?? [];
    const loaded = await Promise.all(
      matches.map(async (artifactPath) => ({
        path: artifactPath,
        content: await readFile(artifactPath, 'utf8'),
      })),
    );
    artifacts.set(projection.type, [...current, ...loaded]);
  }

  const resolvedPath = resolve(path);
  const files = await expandPattern(root, '**/*');
  let payloads: PackagePayloadPlans;
  try {
    payloads = normalizePackagePayloads(resolvedPath, definition, files);
  } catch (cause) {
    if (cause instanceof PackagePayloadPlanError) {
      throw new DefinitionError(cause.message, path, { cause });
    }
    throw cause;
  }

  const exemptDocuments = new Set<string>();
  for (const document of definition.documents ?? []) {
    for (const match of await expandPattern(root, document.pattern)) {
      exemptDocuments.add(match);
    }
  }

  // Artifacts are already loaded above; skip them so a file declared as an
  // artifact is not scanned twice under two identities.
  const artifactPaths = new Set([...artifacts.values()].flat().map(({ path: each }) => each));
  const resources = await Promise.all(
    files
      .filter((file) => !artifactPaths.has(file) && isResourcePath(root, file))
      .map(async (file) => ({ path: file, content: await readFile(file, 'utf8') })),
  );

  return {
    path: resolvedPath,
    definition,
    artifacts,
    files,
    resources,
    exemptDocuments,
    payloads,
  };
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
