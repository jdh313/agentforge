import { z } from 'zod';
import { parseAgentBehavior, parseCommandBehavior } from '../agent-command.ts';
import {
  CompilationError,
  type CompilationPackage,
  type MarketplaceRegistryHandle,
  type PackageManifestHandle,
  type PublicationCompilation,
  type TargetCompilationResult,
} from '../compiler.ts';
import { deepMerge } from '../deep-merge.ts';
import {
  type ArtifactTranslator,
  compilePackagePayload,
  relativePackageArtifactPath,
  relativePackageDirectory,
} from './package-payload.ts';

const DIRECT_TRANSLATORS = new Map<string, ArtifactTranslator>([
  ['agent', directTranslator(parseAgentBehavior)],
  ['command', directTranslator(parseCommandBehavior)],
]);

const PAYLOAD_POLICY = {
  passthroughArtifactTypes: new Set(['hook']),
  translators: DIRECT_TRANSLATORS,
};

const Author = z.looseObject({
  name: z.string().min(1),
  email: z.email().optional(),
  url: z.url().optional(),
});

export const ClaudePluginManifest = z.looseObject({
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  author: Author.optional(),
  homepage: z.url().optional(),
  repository: z.url().optional(),
  license: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  defaultEnabled: z.boolean().optional(),
});

const ClaudeMarketplacePlugin = ClaudePluginManifest.extend({
  source: z.union([z.string().min(1), z.looseObject({ source: z.string().min(1) })]),
});

export const ClaudeMarketplace = z.looseObject({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  owner: Author,
  plugins: z.array(ClaudeMarketplacePlugin),
});

export const ClaudeMarketplaceDocument: MarketplaceRegistryHandle = {
  role: 'marketplace-registry',
  grammar: 'json',
  label: 'Claude marketplace registry',
  schema: ClaudeMarketplace,
  plugins: (document) =>
    ClaudeMarketplace.parse(document).plugins.map((plugin) => ({
      name: plugin.name,
      source:
        typeof plugin.source === 'string'
          ? plugin.source
          : typeof plugin.source.source === 'string'
            ? plugin.source.source
            : undefined,
      version: typeof plugin.version === 'string' ? plugin.version : undefined,
    })),
  rewritePluginSources: (document, rewrite) => {
    const marketplace = ClaudeMarketplace.parse(document);
    return {
      ...marketplace,
      plugins: marketplace.plugins.map((plugin) => ({
        ...plugin,
        source:
          typeof plugin.source === 'string'
            ? rewrite(plugin.source)
            : { ...plugin.source, source: rewrite(plugin.source.source) },
      })),
    };
  },
  manifestPath: (packageDirectory) => `${packageDirectory}/.claude-plugin/plugin.json`,
};

export const ClaudePluginDocument: PackageManifestHandle = {
  role: 'package-manifest',
  grammar: 'json',
  label: 'Claude plugin manifest',
  schema: ClaudePluginManifest,
  identity: (document) => {
    const manifest = ClaudePluginManifest.parse(document);
    return { name: manifest.name, version: manifest.version };
  },
};

export function compileClaudePublication(input: PublicationCompilation): TargetCompilationResult {
  const packages = input.packages.map((packageInput) => compilePackage(input, packageInput));
  const payloads = input.packages.map((packageInput) =>
    compilePackagePayload(input, packageInput, PAYLOAD_POLICY),
  );
  const marketplace = parseDocument(
    ClaudeMarketplace,
    deepMerge(
      {
        ...input.marketplace.metadata,
        plugins: packages.map(({ manifest, source }) => ({ ...manifest, source })),
      },
      input.publication.native,
    ),
    `marketplace document for publication "${input.publication.id}"`,
  );

  return {
    outputs: [
      {
        kind: 'generated',
        producer: 'generated',
        destination: input.publication.destination,
        content: serialize(marketplace),
        nativeDocument: ClaudeMarketplaceDocument,
      },
      ...packages.map(({ packageId, destination, manifest }) => ({
        kind: 'generated' as const,
        producer: 'generated' as const,
        packageId,
        destination,
        content: serialize(manifest),
        nativeDocument: ClaudePluginDocument,
      })),
      ...payloads.flatMap(({ outputs }) => outputs),
    ],
    diagnostics: payloads.flatMap(({ diagnostics }) => diagnostics),
  };
}

function directTranslator(
  parse: (sourcePath: string, source: string) => { source: string },
): ArtifactTranslator {
  return ({ artifact, packageDirectory, packageInput }) => {
    const behavior = parse(artifact.path, artifact.content);
    return {
      outputs: [
        {
          kind: 'generated',
          packageId: packageInput.id,
          destination: `${packageDirectory}/${relativePackageArtifactPath(packageInput.path, artifact.path)}`,
          content: behavior.source,
        },
      ],
      diagnostics: [],
    };
  };
}

function compilePackage(input: PublicationCompilation, packageInput: CompilationPackage) {
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  return {
    packageId: packageInput.id,
    destination: `${packageDirectory}/.claude-plugin/plugin.json`,
    source: `./${packageDirectory}`,
    manifest: parseDocument(
      ClaudePluginManifest,
      deepMerge({ ...packageInput.metadata }, packageInput.native),
      `plugin document for package "${packageInput.id}"`,
    ),
  };
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
    `invalid Claude ${label}: ${path}: ${issue?.message ?? 'validation failed'}`,
  );
}
