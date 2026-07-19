import { dirname, relative, sep } from 'node:path';
import { z } from 'zod';
import {
  CompilationError,
  type CompilationPackage,
  type PublicationCompilation,
  type TargetCompilerAdapter,
} from '../compiler.ts';
import { deepMerge } from '../deep-merge.ts';

const Author = z.looseObject({
  name: z.string().min(1),
  email: z.email().optional(),
  url: z.url().optional(),
});

const CodexInterface = z.looseObject({
  displayName: z.string().min(1),
  shortDescription: z.string().min(1).optional(),
  longDescription: z.string().min(1).optional(),
  developerName: z.string().min(1).optional(),
  category: z.string().min(1),
  capabilities: z.array(z.string().min(1)).optional(),
  defaultPrompt: z.array(z.string().min(1)).optional(),
  websiteURL: z.url().optional(),
  privacyPolicyURL: z.url().optional(),
  termsOfServiceURL: z.url().optional(),
  brandColor: z.string().min(1).optional(),
  composerIcon: z.string().min(1).optional(),
  logo: z.string().min(1).optional(),
  screenshots: z.array(z.string().min(1)).optional(),
});

const CodexPluginManifest = z.looseObject({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  author: Author.optional(),
  homepage: z.url().optional(),
  repository: z.url().optional(),
  license: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  interface: CodexInterface,
});

const CodexMarketplacePlugin = z.looseObject({
  name: z.string().min(1),
  source: z.union([
    z.string().min(1),
    z.looseObject({
      source: z.string().min(1),
    }),
  ]),
  policy: z.looseObject({
    installation: z.enum(['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE']),
    authentication: z.enum(['ON_INSTALL', 'ON_FIRST_USE']),
  }),
  category: z.string().min(1),
});

const CodexMarketplace = z.looseObject({
  name: z.string().min(1),
  interface: z.looseObject({ displayName: z.string().min(1) }).optional(),
  plugins: z.array(CodexMarketplacePlugin),
});

export const codexMarketplaceAdapter: TargetCompilerAdapter = {
  target: 'codex',
  compilePublication(input) {
    const packages = input.packages.map((packageInput) => compilePackage(input, packageInput));
    const marketplace = parseDocument(
      CodexMarketplace,
      deepMerge(
        {
          name: input.marketplace.metadata.name,
          plugins: packages.map(({ manifest, source }) => ({
            name: manifest.name,
            source: {
              source: 'local',
              path: source,
            },
            policy: {
              installation: 'AVAILABLE',
              authentication: 'ON_INSTALL',
            },
            category: manifest.interface.category,
          })),
        },
        input.publication.native,
      ),
      `marketplace document for publication "${input.publication.id}"`,
    );

    return {
      outputs: [
        {
          kind: 'generated',
          destination: input.publication.destination,
          content: serialize(marketplace),
        },
        ...packages.map(({ packageId, destination, manifest }) => ({
          kind: 'generated' as const,
          packageId,
          destination,
          content: serialize(manifest),
        })),
      ],
    };
  },
};

function compilePackage(input: PublicationCompilation, packageInput: CompilationPackage) {
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  return {
    packageId: packageInput.id,
    destination: `${packageDirectory}/.codex-plugin/plugin.json`,
    source: `./${packageDirectory}`,
    manifest: parseDocument(
      CodexPluginManifest,
      deepMerge({ ...packageInput.metadata }, packageInput.native),
      `plugin document for package "${packageInput.id}"`,
    ),
  };
}

function relativePackageDirectory(marketplacePath: string, packagePath: string): string {
  return relative(dirname(marketplacePath), dirname(packagePath)).split(sep).join('/');
}

function serialize(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parseDocument<T>(schema: z.ZodType<T>, document: unknown, label: string): T {
  const result = schema.safeParse(document);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.join('.') || '<root>';
  throw new CompilationError(
    `invalid Codex ${label}: ${path}: ${issue?.message ?? 'validation failed'}`,
  );
}
