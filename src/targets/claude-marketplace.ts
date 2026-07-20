import { z } from 'zod';
import { parseAgentBehavior, parseCommandBehavior } from '../agent-command.ts';
import {
  CompilationError,
  type CompilationPackage,
  type PublicationCompilation,
  type TargetCompilerAdapter,
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

export const claudeMarketplaceAdapter: TargetCompilerAdapter = {
  target: 'claude',
  compilePublication(input) {
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
        },
        ...packages.map(({ packageId, destination, manifest }) => ({
          kind: 'generated' as const,
          producer: 'generated' as const,
          packageId,
          destination,
          content: serialize(manifest),
        })),
        ...payloads.flatMap(({ outputs }) => outputs),
      ],
      diagnostics: payloads.flatMap(({ diagnostics }) => diagnostics),
    };
  },
};

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
