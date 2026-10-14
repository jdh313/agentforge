import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import { CanonicalMarketplace, DefinitionError } from './definitions.ts';
import { portablePathReason } from './publication-paths.ts';
import { TARGET_NAMES } from './types.ts';

export const REPOSITORY_FILENAME = 'agentforge.yaml';
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated identifier');
const RepositoryPath = z.string().superRefine((path, context) => {
  const reason = portablePathReason(path);
  if (reason) context.addIssue({ code: 'custom', message: reason });
});
const MarketplacePublication = CanonicalMarketplace.shape.publications.element.extend({
  kind: z.literal('marketplace'),
  out: RepositoryPath,
});
const PackagePublication = z.strictObject({
  id: Slug,
  kind: z.literal('package'),
  target: z.enum(TARGET_NAMES),
  package: Slug,
  out: RepositoryPath,
});

/** Repository authoring, not a registry consumed by a runtime. */
export const CanonicalRepository = z
  .strictObject({
    schema: z.literal('agentforge.repository/v1'),
    id: Slug,
    defaults: CanonicalMarketplace.shape.defaults.optional(),
    packages: z.array(RepositoryPath).min(1),
    publications: z
      .array(z.discriminatedUnion('kind', [MarketplacePublication, PackagePublication]))
      .min(1),
    redactions: CanonicalMarketplace.shape.redactions,
  })
  .superRefine((definition, context) => {
    for (const [key, values] of [
      ['packages', definition.packages],
      ['publications', definition.publications.map((publication) => publication.id)],
    ] as const) {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value))
          context.addIssue({
            code: 'custom',
            path: [key, index],
            message: `duplicate ${key}: ${value}`,
          });
        seen.add(value);
      });
    }
    if (
      !definition.defaults &&
      definition.publications.some((publication) => publication.kind === 'marketplace')
    )
      context.addIssue({
        code: 'custom',
        path: ['defaults'],
        message: 'marketplace publications require repository defaults',
      });
  });

export type RepositoryDefinition = z.infer<typeof CanonicalRepository>;
export type RepositoryPublication = RepositoryDefinition['publications'][number];
export interface LoadedRepositoryDefinition {
  path: string;
  root: string;
  definition: RepositoryDefinition;
}

export function loadRepositoryDefinition(path: string): LoadedRepositoryDefinition {
  const absolute = resolve(path);
  if (basename(absolute) !== REPOSITORY_FILENAME)
    throw new DefinitionError(`expected repository filename ${REPOSITORY_FILENAME}`, absolute);
  if (!lstatSync(absolute).isFile())
    throw new DefinitionError(
      'repository definition must be a regular file, not a symbolic link',
      absolute,
    );
  // The invocation path may have a symlinked ancestor; anchor all paths to the real config directory.
  const root = realpathSync(dirname(absolute));
  const anchor = resolve(root, REPOSITORY_FILENAME);
  let document: unknown;
  try {
    document = Bun.YAML.parse(readFileSync(anchor, 'utf8'));
  } catch (cause) {
    throw new DefinitionError('invalid YAML', anchor, { cause });
  }
  const result = CanonicalRepository.safeParse(document);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new DefinitionError(`invalid repository definition (${messages})`, anchor);
  }
  return { path: anchor, root, definition: result.data };
}
