import matter from 'gray-matter';
import { z } from 'zod';
import { parseAgentBehavior, parseCommandBehavior } from '../agent-command.ts';
import {
  CompilationError,
  type CompilationPackage,
  type ProposedCompilationDiagnostic,
  type PublicationCompilation,
  type TargetCompilerAdapter,
} from '../compiler.ts';
import { deepMerge } from '../deep-merge.ts';
import {
  type ArtifactTranslator,
  type ArtifactTranslatorInput,
  compilePackagePayload,
  type PackagePayloadResult,
  relativePackageArtifactPath,
  relativePackageDirectory,
} from './package-payload.ts';

const INFERRED_TRANSLATORS = new Map<string, ArtifactTranslator>([
  ['agent', translateAgentProcedure],
  ['command', translateCommandSkill],
  ['hook', translateHookConfiguration],
]);

const PAYLOAD_POLICY = {
  passthroughArtifactTypes: new Set<string>(),
  translators: INFERRED_TRANSLATORS,
  requireConstructDispositions: true,
};

// Codex lifecycle events, per the Codex hooks reference. Claude events outside
// this set (for example `Notification`) have no Codex analog.
const CODEX_HOOK_EVENTS = new Set([
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'SessionStart',
  'SessionEnd',
]);

// Codex caps a configured `SessionEnd` timeout at three seconds; every other
// event allows the full default.
const SESSION_END_TIMEOUT_CAP_SECONDS = 3;

// `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` survive in Codex only as legacy
// compatibility aliases. Emit the native names instead.
// biome-ignore-start lint/suspicious/noTemplateCurlyInString: replacements are literal Codex env-var names
const CLAUDE_HOOK_ENV_ALIASES: readonly (readonly [RegExp, string])[] = [
  [/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}'],
  [/\$\{CLAUDE_PLUGIN_DATA\}/g, '${PLUGIN_DATA}'],
];
// biome-ignore-end lint/suspicious/noTemplateCurlyInString: replacements are literal Codex env-var names

const ClaudeHookHandler = z.looseObject({
  type: z.literal('command'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeout: z.number().finite().positive().optional(),
});

const ClaudeHookGroup = z.looseObject({
  matcher: z.string().optional(),
  hooks: z.array(ClaudeHookHandler).min(1),
});

const ClaudeHookDocument = z.looseObject({
  description: z.string().min(1).optional(),
  hooks: z.record(z.string(), z.array(ClaudeHookGroup)),
});

const CodexHookHandler = z
  .looseObject({
    type: z.literal('command'),
    command: z.string().min(1),
    commandWindows: z.string().min(1).optional(),
    timeout: z.number().finite().positive().optional(),
    statusMessage: z.string().min(1).optional(),
    additionalContextLimit: z.number().finite().nonnegative().optional(),
  })
  .refine(
    (handler) => !('args' in handler),
    'Codex hook handlers accept a single "command" string and have no "args" field',
  );

export const CodexHookConfiguration = z.looseObject({
  description: z.string().min(1).optional(),
  hooks: z.record(
    z.string(),
    z.array(
      z.looseObject({
        matcher: z.string().optional(),
        hooks: z.array(CodexHookHandler).min(1),
      }),
    ),
  ),
});

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
  // A `./`-relative path (or paths) to a hook configuration, or an inline
  // configuration. Omitting the field lets Codex auto-discover
  // `hooks/hooks.json`; declaring it pins what the compiler materialized.
  hooks: z
    .union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1),
      CodexHookConfiguration,
      z.array(CodexHookConfiguration).min(1),
    ])
    .optional(),
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
    // Payloads first: the manifest's `hooks` declaration must name what the
    // translator actually materialized, not merely what the package declared.
    const payloads = input.packages.map((packageInput) =>
      compilePackagePayload(input, packageInput, PAYLOAD_POLICY),
    );
    const packages = input.packages.map((packageInput, index) =>
      compilePackage(
        input,
        packageInput,
        materializedHookPaths(input, packageInput, payloads[index]),
      ),
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

function translateHookConfiguration({
  artifact,
  packageDirectory,
  packageInput,
}: ArtifactTranslatorInput): PackagePayloadResult {
  const source = parseHookDocument(artifact.path, artifact.content);
  const relativePath = relativePackageArtifactPath(packageInput.path, artifact.path);
  const diagnostics: ProposedCompilationDiagnostic[] = [];
  const hooks: Record<string, unknown[]> = {};
  const translatedEvents: string[] = [];

  for (const [event, groups] of Object.entries(source.hooks)) {
    if (!CODEX_HOOK_EVENTS.has(event)) {
      diagnostics.push({
        code: 'unsupported-hook-event',
        severity: 'warning',
        packageId: packageInput.id,
        message: `Hook event "${event}" in ${relativePath} has no Codex analog and is absent from Codex output.`,
        retainedSource: { artifactType: 'hook', sourcePath: artifact.path },
      });
      continue;
    }

    translatedEvents.push(event);
    hooks[event] = groups.map((group) => {
      const handlers = group.hooks.map((handler) => {
        if (handler.args !== undefined) {
          diagnostics.push({
            code: 'translated-hook-handler-args',
            severity: 'warning',
            packageId: packageInput.id,
            message: `Hook handler for "${event}" in ${relativePath} declares "args", which Codex has no field for; folded into the "command" string.`,
            retainedSource: { artifactType: 'hook', sourcePath: artifact.path },
          });
        }
        if (
          event === 'SessionEnd' &&
          handler.timeout !== undefined &&
          handler.timeout > SESSION_END_TIMEOUT_CAP_SECONDS
        ) {
          diagnostics.push({
            code: 'hook-timeout-capped-by-runtime',
            severity: 'warning',
            packageId: packageInput.id,
            message: `Hook handler for "SessionEnd" in ${relativePath} declares a ${handler.timeout}s timeout; Codex caps SessionEnd at ${SESSION_END_TIMEOUT_CAP_SECONDS}s, so the declared value is not honored in full.`,
            retainedSource: { artifactType: 'hook', sourcePath: artifact.path },
          });
        }
        const { args, ...rest } = handler;
        return {
          ...rest,
          type: 'command' as const,
          command: foldHookCommand(handler.command, args),
        };
      });
      return {
        ...(group.matcher === undefined ? {} : { matcher: group.matcher }),
        hooks: handlers,
      };
    });
  }

  if (translatedEvents.length === 0) {
    // Say so rather than dropping the artifact silently: a hook that projects
    // nothing is a reviewable fact, not an absence.
    if (Object.keys(source.hooks).length === 0) {
      diagnostics.push({
        code: 'empty-hook-configuration',
        severity: 'note',
        packageId: packageInput.id,
        message: `Hook configuration ${relativePath} declares no events; nothing was projected for Codex.`,
        retainedSource: { artifactType: 'hook', sourcePath: artifact.path },
      });
    }
    return { outputs: [], diagnostics };
  }

  const translated = parseDocument(
    CodexHookConfiguration,
    {
      ...(source.description === undefined ? {} : { description: source.description }),
      hooks,
    },
    `hook configuration for package "${packageInput.id}"`,
  );

  return {
    outputs: [
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${packageDirectory}/${relativePath}`,
        content: serialize(translated),
      },
    ],
    diagnostics: [
      {
        code: 'inferred-artifact-projection',
        severity: 'note',
        packageId: packageInput.id,
        message: `Hook configuration ${relativePath} translated into Codex's handler schema for ${translatedEvents.join(', ')}; Codex skips plugin-bundled hooks until the user reviews and trusts the definition.`,
        retainedSource: { artifactType: 'hook', sourcePath: artifact.path },
      },
      ...diagnostics,
    ],
  };
}

// Codex's `command` is a single "script path and arguments" string, so Claude's
// separate `args` array folds into it. Quote only what would otherwise re-split,
// keeping `${PLUGIN_ROOT}` expandable and matching Codex's documented style.
function foldHookCommand(command: string, args: readonly string[] | undefined): string {
  const rewritten = rewriteClaudeHookEnv(command);
  if (args === undefined || args.length === 0) return rewritten;
  return [rewritten, ...args.map((arg) => quoteHookArgument(rewriteClaudeHookEnv(arg)))].join(' ');
}

// Claude hands `args` to argv with no shell involved; Codex splits a single
// string *with* one. Anything outside a conservative safe set must therefore be
// quoted, or an argument becomes shell syntax: `x;whoami` would run a second
// command, `don't` would be a syntax error, `*.ts` would glob, and `''` would
// vanish and shift the positionals that follow.
const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

// The plugin-root references we just rewrote are the one thing that must still
// expand, so they survive quoting while the literal text around them does not.
const EXPANDABLE_REFERENCE = /(\$\{(?:PLUGIN_ROOT|PLUGIN_DATA)\})/;

function quoteHookArgument(argument: string): string {
  if (SHELL_SAFE_ARGUMENT.test(argument)) return argument;
  const quoted = argument
    .split(EXPANDABLE_REFERENCE)
    .map((segment) => (EXPANDABLE_REFERENCE.test(segment) ? segment : escapeQuotedSegment(segment)))
    .join('');
  return `"${quoted}"`;
}

// Inside double quotes a shell still acts on `$`, a backtick, and a backslash,
// so neutralize those; whitespace, `;`, `|`, `&`, and globs are already inert.
function escapeQuotedSegment(segment: string): string {
  return segment
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`');
}

function rewriteClaudeHookEnv(value: string): string {
  let rewritten = value;
  for (const [pattern, replacement] of CLAUDE_HOOK_ENV_ALIASES) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  return rewritten;
}

function parseHookDocument(
  sourcePath: string,
  content: string,
): z.infer<typeof ClaudeHookDocument> {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (cause) {
    throw new CompilationError(
      `invalid hook configuration ${sourcePath}: invalid JSON${cause instanceof Error ? `: ${cause.message}` : ''}`,
    );
  }
  return parseDocument(ClaudeHookDocument, document, `hook configuration ${sourcePath}`);
}

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

function compilePackage(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
  hookPaths: readonly string[],
) {
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  return {
    packageId: packageInput.id,
    destination: `${packageDirectory}/.codex-plugin/plugin.json`,
    source: `./${packageDirectory}`,
    manifest: parseDocument(
      CodexPluginManifest,
      deepMerge({ ...packageInput.metadata, ...declaredHooks(hookPaths) }, packageInput.native),
      `plugin document for package "${packageInput.id}"`,
    ),
  };
}

// Pin what the compiler actually materialized rather than leaning on Codex's
// auto-discovery of `hooks/hooks.json`, so a declared path that goes missing is
// a detectable mismatch instead of a silently skipped hook.
function declaredHooks(hookPaths: readonly string[]): { hooks?: string | string[] } {
  if (hookPaths.length === 0) return {};
  return { hooks: hookPaths.length === 1 ? (hookPaths[0] as string) : [...hookPaths] };
}

// A declared hook artifact whose every event was untranslatable produces no
// output; declaring its path anyway would name a file that does not exist.
function materializedHookPaths(
  input: PublicationCompilation,
  packageInput: CompilationPackage,
  payload: PackagePayloadResult | undefined,
): string[] {
  if (!payload) return [];
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  const materialized = new Set(
    payload.outputs
      .filter((output) => output.kind === 'generated')
      .map(({ destination }) => destination),
  );
  return (packageInput.artifacts.get('hook') ?? [])
    .map(({ path }) => relativePackageArtifactPath(packageInput.path, path))
    .filter((relativePath) => materialized.has(`${packageDirectory}/${relativePath}`))
    .map((relativePath) => `./${relativePath}`)
    .toSorted(compareStrings);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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
