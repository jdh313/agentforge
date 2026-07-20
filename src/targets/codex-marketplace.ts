import matter from 'gray-matter';
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
  type ArtifactTranslatorInput,
  compilePackagePayload,
  type PackagePayloadResult,
  relativePackageDirectory,
} from './package-payload.ts';

const INFERRED_TRANSLATORS = new Map<string, ArtifactTranslator>([
  ['agent', translateAgentProcedure],
  ['command', translateCommandSkill],
]);

const PAYLOAD_POLICY = {
  passthroughArtifactTypes: new Set<string>(),
  translators: INFERRED_TRANSLATORS,
};

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

export const CodexPluginManifest = z.looseObject({
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
  source: z.looseObject({
    source: z.literal('local'),
    path: z.string().min(1),
  }),
  policy: z.looseObject({
    installation: z.enum(['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE']),
    authentication: z.enum(['ON_INSTALL', 'ON_FIRST_USE']),
  }),
  category: z.string().min(1),
});

export const CodexMarketplace = z.looseObject({
  name: z.string().min(1),
  interface: z.looseObject({ displayName: z.string().min(1) }).optional(),
  plugins: z.array(CodexMarketplacePlugin),
});

export const codexMarketplaceAdapter: TargetCompilerAdapter = {
  target: 'codex',
  compilePublication(input) {
    const packages = input.packages.map((packageInput) => compilePackage(input, packageInput));
    const payloads = input.packages.map((packageInput) =>
      compilePackagePayload(input, packageInput, PAYLOAD_POLICY),
    );
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

function translateAgentProcedure({
  artifact,
  packageDirectory,
  packageInput,
}: ArtifactTranslatorInput): PackagePayloadResult {
  const agent = parseAgentBehavior(artifact.path, artifact.content);
  return {
    outputs: [
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${packageDirectory}/agents/${agent.name}.md`,
        content: ensureTrailingNewline(agent.instructions.trimStart()),
      },
    ],
    diagnostics: [
      {
        code: 'inferred-artifact-projection',
        severity: 'note',
        packageId: packageInput.id,
        message: `Agent "${agent.name}" inferred as a reusable Codex role procedure; Claude model, turn, and tool constraints remain in the retained source and are not enforced by Codex.`,
        retainedSource: { artifactType: 'agent', sourcePath: artifact.path },
      },
    ],
  };
}

function translateCommandSkill({
  artifact,
  packageDirectory,
  packageInput,
}: ArtifactTranslatorInput): PackagePayloadResult {
  const command = parseCommandBehavior(artifact.path, artifact.content);
  const skillDirectory = `${packageDirectory}/skills/${command.name}`;
  return {
    outputs: [
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${skillDirectory}/SKILL.md`,
        content: matter.stringify(command.instructions, {
          name: command.name,
          description: command.description,
        }),
      },
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${skillDirectory}/agents/openai.yaml`,
        content: codexSkillPolicy(command.name, command.description),
      },
    ],
    diagnostics: [
      {
        code: 'inferred-artifact-projection',
        severity: 'note',
        packageId: packageInput.id,
        message: `Command "${command.name}" inferred as an explicit-invocation Codex skill; Claude argument hints and tool restrictions remain in the retained source and are not enforced by Codex.`,
        retainedSource: { artifactType: 'command', sourcePath: artifact.path },
      },
    ],
  };
}

function codexSkillPolicy(name: string, description: string): string {
  return [
    'interface:',
    `  display_name: ${JSON.stringify(humanize(name))}`,
    `  short_description: ${JSON.stringify(description)}`,
    'policy:',
    '  allow_implicit_invocation: false',
    '',
  ].join('\n');
}

function humanize(name: string): string {
  return name
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

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
