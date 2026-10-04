import { basename, dirname } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { parseAgentBehavior, parseCommandBehavior } from '../agent-command.ts';
import { supportFor, translationsFor } from '../capabilities.ts';
import { compileCodexAgentBundleOutputs } from '../codex-agent-bundle.ts';
import {
  CompilationError,
  type CompilationPackage,
  type MarketplaceRegistryHandle,
  type PackageManifestHandle,
  type ProposedCompilationDiagnostic,
  type ProposedOutput,
  type PublicationCompilation,
  type SourceLocation,
  type TargetCompilationResult,
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

// ndr:pz1x3e: artifact hooks may leave the leaf only when the package compiler
// also gives them a native package destination and reports the widened scope.
const ARTIFACT_AUGMENTERS = new Map<string, ArtifactTranslator>([
  ['skill', (input) => translateArtifactHooks(input, 'skill')],
  ['agent', (input) => translateArtifactHooks(input, 'agent')],
]);

const PAYLOAD_POLICY = {
  passthroughArtifactTypes: new Set<string>(),
  translators: INFERRED_TRANSLATORS,
  augmenters: ARTIFACT_AUGMENTERS,
  requireDeclaredLosses: true,
};

// Which lifecycle events Codex fires is the capability table's to say
// (ndr:g6xvyk, ndr:mfchxa); this file used to keep its own `Set`, which is how
// the fact escaped the per-row citation discipline. See the `codex/hook` row.

// Codex caps a configured `SessionEnd` timeout at three seconds; every other
// event allows the full default. Verified against codex-cli 0.147.0 alongside
// the `codex/hook` event set. Still a literal rather than a table row because
// `CapabilityRow` carries token lists, not numeric limits — extending the row
// shape is a separate change, and ndr:bm3m2j governs the behavior (warn, do not
// clamp) regardless of where the number lives.
const SESSION_END_TIMEOUT_CAP_SECONDS = 3;

// `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` survive in Codex only as legacy
// compatibility aliases, so the native names are emitted instead. Which
// variables those are, and what each becomes, is the capability table's to say;
// keeping a second literal list here is how the fact drifted out of the model
// in the first place. Sourced from the `codex/hook` row, not `codex/skill`:
// these two are documented only for a hook command's process environment
// (and Agent Plugins MCP stdio `cwd`), never for SKILL.md body text (ndr:61cmc9).
const HOOK_ENV_TRANSLATIONS = translationsFor('codex', 'hook');

const CLAUDE_HOOK_ENV_ALIASES: readonly (readonly [RegExp, string])[] = HOOK_ENV_TRANSLATIONS.map(
  ([token, replacement]) => [new RegExp(escapeRegExp(token), 'g'), replacement] as const,
);

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ClaudeHookHandler = z.looseObject({
  type: z.literal('command'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeout: z.number().finite().positive().optional(),
  once: z.boolean().optional(),
});

const ClaudeHookGroup = z.looseObject({
  matcher: z.string().optional(),
  hooks: z.array(ClaudeHookHandler).min(1),
});

// Claude Code accepts two hook forms in one document: classic `hooks` (shell
// handlers per event) and `modules` (function-hook modules run in-process).
// Codex has a form for the first only; `modules` reaches the declared-loss gate
// as `hook-module` and never reaches Codex output.
const ClaudeHookDocument = z
  .looseObject({
    description: z.string().min(1).optional(),
    hooks: z.record(z.string(), z.array(ClaudeHookGroup)).optional(),
    modules: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    (document) => document.hooks !== undefined || document.modules !== undefined,
    'declare "hooks", "modules", or both',
  );

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

export const CodexMarketplaceDocument: MarketplaceRegistryHandle = {
  role: 'marketplace-registry',
  grammar: 'json',
  label: 'Codex marketplace registry',
  schema: CodexMarketplace,
  plugins: (document) =>
    CodexMarketplace.parse(document).plugins.map((plugin) => ({
      name: plugin.name,
      source: plugin.source.path,
      version: undefined,
    })),
  rewritePluginSources: (document, rewrite) => {
    const marketplace = CodexMarketplace.parse(document);
    return {
      ...marketplace,
      plugins: marketplace.plugins.map((plugin) => ({
        ...plugin,
        source: { ...plugin.source, path: rewrite(plugin.source.path) },
      })),
    };
  },
  manifestPath: (packageDirectory) => `${packageDirectory}/.codex-plugin/plugin.json`,
};

export const CodexPluginDocument: PackageManifestHandle = {
  role: 'package-manifest',
  grammar: 'json',
  label: 'Codex plugin manifest',
  schema: CodexPluginManifest,
  identity: (document) => {
    const manifest = CodexPluginManifest.parse(document);
    return { name: manifest.name, version: manifest.version };
  },
};

export function compileCodexPublication(input: PublicationCompilation): TargetCompilationResult {
  // Payloads first: the manifest's `hooks` declaration must name what the
  // translator actually materialized, not merely what the package declared.
  const payloads = input.packages.map((packageInput) =>
    compilePackagePayload(input, packageInput, PAYLOAD_POLICY),
  );
  const bundleHooks = new Map(
    input.packages
      .filter((packageInput) => packageInput.codexAgentBundle)
      .map((packageInput) => [
        packageInput.id,
        compileCodexAgentBundleCheckHook(packageInput, input),
      ]),
  );
  const packages = input.packages.map((packageInput, index) =>
    compilePackage(
      input,
      packageInput,
      [
        ...new Set([
          ...materializedHookPaths(payloads[index]),
          ...(bundleHooks.get(packageInput.id)?.hookPaths ?? []),
        ]),
      ].toSorted(compareStrings),
    ),
  );
  const bundles = input.packages
    .filter((packageInput) => packageInput.codexAgentBundle)
    .map((packageInput) => {
      const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
      return {
        ...compileCodexAgentBundleOutputs(packageInput, packageDirectory),
        setupOutputs: [
          ...compileCodexAgentBundleSetupSkill(packageInput, packageDirectory),
          ...(bundleHooks.get(packageInput.id)?.outputs ?? []),
        ],
      };
    });
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
        nativeDocument: CodexMarketplaceDocument,
      },
      ...packages.map(({ packageId, destination, manifest }) => ({
        kind: 'generated' as const,
        producer: 'generated' as const,
        packageId,
        destination,
        content: serialize(manifest),
        nativeDocument: CodexPluginDocument,
      })),
      ...payloads.flatMap(({ outputs }) => outputs),
      ...bundles.flatMap(({ outputs, setupOutputs }) => [...outputs, ...setupOutputs]),
    ],
    diagnostics: [
      ...payloads.flatMap(({ diagnostics }) => diagnostics),
      ...bundles.flatMap(({ diagnostics }) => diagnostics),
    ],
  };
}

const CODEX_AGENT_BUNDLE_SETUP_SKILL = 'setup-codex-agents';

// A marketplace plugin can expose a skill, but it cannot add a package-local
// directory to Codex's native agent-role loader. The generated skill makes the
// companion's opt-in registration procedure visible without pretending that
// installing the plugin completed it. It derives the bundle from its own
// loaded SKILL.md path rather than from a cache layout or an undocumented
// interpolation variable.
function compileCodexAgentBundleSetupSkill(
  packageInput: CompilationPackage,
  packageDirectory: string,
): ProposedOutput[] {
  assertNoCodexAgentBundleSetupSkillCollision(packageInput);
  const agents = (packageInput.artifacts.get('agent') ?? []).map((artifact) => {
    const agent = parseAgentBehavior(artifact.path, artifact.content);
    return { identity: `${packageInput.id}:${agent.name}` };
  });
  const skillDirectory = `${packageDirectory}/skills/${CODEX_AGENT_BUNDLE_SETUP_SKILL}`;
  const description = 'Register this plugin’s optional Codex agent roles for one scope.';
  return [
    {
      kind: 'generated',
      packageId: packageInput.id,
      destination: `${skillDirectory}/SKILL.md`,
      content: matter.stringify(codexAgentBundleSetupInstructions(agents), {
        name: CODEX_AGENT_BUNDLE_SETUP_SKILL,
        description,
      }),
    },
    {
      kind: 'generated',
      packageId: packageInput.id,
      destination: `${skillDirectory}/agents/openai.yaml`,
      content: codexSkillPolicy(CODEX_AGENT_BUNDLE_SETUP_SKILL, description),
    },
    {
      kind: 'generated',
      packageId: packageInput.id,
      destination: `${skillDirectory}/scripts/manage-codex-agent-bundle.sh`,
      content: codexAgentBundleSetupScript(packageInput.id),
    },
  ];
}

const CODEX_AGENT_CHECK_HOOK = 'hooks/agentforge-codex-agents.json';
const CODEX_AGENT_CHECK_SCRIPT = '.agentforge/check-codex-agents.sh';
// Two read-only `check-codex-agent` runs, well under Codex's default hook
// budget (ndr:bm3m2j).
const CODEX_AGENT_CHECK_TIMEOUT_SECONDS = 10;

// A SessionStart hook that tells the user when this package's agent roles are
// not registered or not current. Its own hook file and manifest entry, never
// merged into an author's hooks.json (ndr:pz1x3e). Generated outputs carry no
// executable bit, so the command runs the script through `sh`, as the setup
// skill does.
function compileCodexAgentBundleCheckHook(
  packageInput: CompilationPackage,
  input: PublicationCompilation,
): { outputs: ProposedOutput[]; hookPaths: string[] } {
  const packageDirectory = relativePackageDirectory(input.marketplace.path, packageInput.path);
  const configuration = parseDocument(
    CodexHookConfiguration,
    {
      description: `Reports when ${packageInput.id} Codex agent roles are not registered or current.`,
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `sh "\${PLUGIN_ROOT}/${CODEX_AGENT_CHECK_SCRIPT}"`,
                timeout: CODEX_AGENT_CHECK_TIMEOUT_SECONDS,
              },
            ],
          },
        ],
      },
    },
    `agent role check hook for package "${packageInput.id}"`,
  );
  return {
    outputs: [
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${packageDirectory}/${CODEX_AGENT_CHECK_HOOK}`,
        content: serialize(configuration),
      },
      {
        kind: 'generated',
        packageId: packageInput.id,
        destination: `${packageDirectory}/${CODEX_AGENT_CHECK_SCRIPT}`,
        content: codexAgentBundleCheckScript(packageInput.id),
      },
    ],
    hookPaths: [`./${CODEX_AGENT_CHECK_HOOK}`],
  };
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// SessionStart hook output contract (https://learn.chatgpt.com/docs/hooks):
// plain stdout is added as developer context for the model only, while the
// common `systemMessage` JSON field is surfaced to the user as a warning. The
// script therefore prints one JSON object with `systemMessage`, or nothing.
function codexAgentBundleCheckScript(packageId: string): string {
  const quotedPackageId = shellSingleQuote(packageId);
  return `#!/bin/sh
# Read-only SessionStart check: at most one {"systemMessage": "..."} object on
# stdout, nothing when roles are current, always exit 0.
package_id=${quotedPackageId}
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
plugin_root=\${PLUGIN_ROOT:-$(dirname "$script_dir")}
agentforge_bin=\${AGENTFORGE_BIN:-agentforge}

warn() {
  escaped=$(printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
  printf '{"systemMessage": "%s"}\\n' "$escaped"
  exit 0
}

if ! command -v "$agentforge_bin" >/dev/null 2>&1; then
  warn "$package_id: AgentForge not found; install a released AgentForge binary from https://github.com/jdh313/agentforge/releases to register agent roles"
fi

bundle_root="$plugin_root/.agentforge/codex-agent-bundle"

# Sets $status to current, missing, or the first token of a refusing result.
check_scope() {
  if out=$("$agentforge_bin" check-codex-agent "$bundle_root" "$@" 2>/dev/null); then
    status=current
  else
    status=$(printf '%s\\n' "$out" | head -n 1 | cut -d: -f1)
  fi
}

# Words the one line for a scope that is not current.
advise() {
  scope=$1
  shift
  extra=$*
  if [ "$status" = missing ]; then
    fix="run agentforge sync-codex-agents --scope $scope"
  else
    fix="run agentforge check-codex-agent $bundle_root --scope $scope\${extra:+ $extra} to review"
  fi
  warn "$package_id: agent roles are not current at $scope scope; $fix"
}

# The package is fine when any checked scope is current. The project scope is
# checked only where a receipt exists, nearest ancestor of $PWD first.
check_scope --scope user
[ "$status" = current ] && exit 0
user_status=$status

project_root=
dir=$PWD
while :; do
  if [ -f "$dir/.codex/agents/.agentforge/$package_id.json" ]; then
    project_root=$dir
    break
  fi
  parent=$(dirname "$dir")
  [ "$parent" = "$dir" ] && break
  dir=$parent
done

if [ -n "$project_root" ]; then
  check_scope --scope project --project-root "$project_root"
  [ "$status" = current ] && exit 0
  advise project --project-root "$project_root"
fi
status=$user_status
advise user
`;
}

function codexAgentBundleSetupInstructions(agents: readonly { identity: string }[]): string {
  const knownRoles = agents.map(({ identity }) => `- \`${identity}\``).join('\n');
  return `# Set up Codex agent roles

This plugin installation makes this setup skill available. It does not register
native Codex agent roles. Registration is an optional companion operation that
writes the selected scope's Codex role files, configuration, and ownership
receipt through the installed AgentForge CLI.

## Locate this plugin's companion bundle

Use the absolute path of this active \`SKILL.md\` supplied by the skill context.
Set \`skill_file\` to that path, then derive the plugin root from this skill's
directory layout and validate the result before any change:

\`\`\`sh
skill_file='<absolute path of this active SKILL.md>'
plugin_root="$(dirname "$(dirname "$(dirname "$skill_file")")")"
bundle_root="$plugin_root/.agentforge/codex-agent-bundle"
test -f "$bundle_root/agentforge-codex-agent-bundle.json"
\`\`\`

If the active skill path is unavailable, ask the user for the installed plugin
root and set \`plugin_root\` to that exact absolute path. Do not guess a cache
path, plugin version, or another installed plugin.

## Register, check, update, or remove one scope

Ask whether the user wants \`user\` or \`project\` scope. For project scope,
ask for the project root and use it literally as \`<project-root>\`:

\`\`\`sh
script="$plugin_root/skills/setup-codex-agents/scripts/manage-codex-agent-bundle.sh"

# user scope: choose one operation
sh "$script" install user
sh "$script" check user
sh "$script" update user
sh "$script" remove user

# project scope: choose one operation
sh "$script" install project '<project-root>'
sh "$script" check project '<project-root>'
sh "$script" update project '<project-root>'
sh "$script" remove project '<project-root>'
\`\`\`

Run an action only when the user selected it. The script resolves its own
plugin root and invokes the installed \`agentforge\` command. It checks the
required subcommand first, including the matching preview before update or
removal. If a command is missing or incompatible, stop before modifying Codex files and install a release binary from
\`https://github.com/jdh313/agentforge/releases\` whose \`--help\` lists that
subcommand. A version number alone is not compatibility evidence.

Treat a nonzero script result as a failure: report its output and do not
continue to a later lifecycle action. Check is read-only. A role edited by the
user is preserved and remains recorded for review. Plugin removal does not
remove these registered roles. Remove each scope independently with the
receipt-based script action; do not clean up roles automatically.

Project registration needs write access to \`<project-root>/.codex\`. If a
managed permission profile denies that directory, request access or run this
visible script in a terminal authorized to write it, then rerun \`check\`.

## Register every installed plugin at once

When the user asks to set up every installed plugin at once, run
\`agentforge sync-codex-agents --scope user\` (add \`--dry-run\` to preview). It
installs or updates the roles of every enabled plugin that ships a Codex agent
bundle; treat a nonzero result as a failure, as above. The per-plugin script
above remains available.

## Use a registered role

Before claiming that a role is registered or dispatching it, run the selected
scope's \`check\` action. A nonzero result means setup is missing, edited, or
otherwise not current; report that setup gap and do not dispatch. After a
successful check, start a fresh Codex session before dispatch.
This bundle emits only these exact role identities:

${knownRoles}

For one of those roles, pass its emitted identity unchanged as
\`agent_type\` to \`spawn_agent\`. If the user names any other role, say that
this companion bundle has no setup for that role. Do not rewrite the requested
name into a different identity or claim that the retained Markdown procedure
registered it.`;
}

function codexAgentBundleSetupScript(packageId: string): string {
  const quotedPackageId = JSON.stringify(packageId);
  return `#!/bin/sh
set -eu

usage() {
  echo "usage: $0 <install|check|update|remove> <user|project> [project-root]" >&2
  exit 64
}

operation=\${1:-}
scope=\${2:-}
project_root=\${3:-}

case "$operation" in
  install) subcommand=install-codex-agent ;;
  check) subcommand=check-codex-agent ;;
  update)
    preview_subcommand=preview-codex-agent-update
    subcommand=update-codex-agent
    ;;
  remove)
    preview_subcommand=preview-codex-agent-remove
    subcommand=remove-codex-agent
    ;;
  *) usage ;;
esac

case "$scope" in
  user)
    [ "$#" -eq 2 ] || usage
    ;;
  project)
    [ "$#" -eq 3 ] && [ -n "$project_root" ] || usage
    ;;
  *) usage ;;
esac

agentforge_bin=\${AGENTFORGE_BIN:-agentforge}
incompatible() {
  echo "AgentForge is missing or incompatible: expected \\"$agentforge_bin $1 --help\\" to succeed." >&2
  echo "Install a released AgentForge binary from https://github.com/jdh313/agentforge/releases whose --help lists $1, put it on PATH, then retry." >&2
  exit 69
}
if ! command -v "$agentforge_bin" >/dev/null 2>&1; then
  incompatible "$subcommand"
fi
if ! "$agentforge_bin" "$subcommand" --help >/dev/null 2>&1; then
  incompatible "$subcommand"
fi
if [ -n "\${preview_subcommand:-}" ] && ! "$agentforge_bin" "$preview_subcommand" --help >/dev/null 2>&1; then
  incompatible "$preview_subcommand"
fi

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
plugin_root=$(CDPATH= cd "$script_dir/../../.." && pwd -P)
bundle_root="$plugin_root/.agentforge/codex-agent-bundle"
package_id=${quotedPackageId}

if [ "$operation" = remove ]; then
  if [ "$scope" = user ]; then
    "$agentforge_bin" "$preview_subcommand" "$package_id" --scope user
    exec "$agentforge_bin" "$subcommand" "$package_id" --scope user
  fi
  "$agentforge_bin" "$preview_subcommand" "$package_id" --scope project --project-root "$project_root"
  exec "$agentforge_bin" "$subcommand" "$package_id" --scope project --project-root "$project_root"
fi

if [ ! -f "$bundle_root/agentforge-codex-agent-bundle.json" ]; then
  echo "Codex agent bundle is missing: $bundle_root/agentforge-codex-agent-bundle.json" >&2
  exit 66
fi

if [ "$scope" = user ]; then
  if [ "$operation" = update ]; then
    "$agentforge_bin" "$preview_subcommand" "$bundle_root" --scope user
  fi
  exec "$agentforge_bin" "$subcommand" "$bundle_root" --scope user
fi
if [ "$operation" = update ]; then
  "$agentforge_bin" "$preview_subcommand" "$bundle_root" --scope project --project-root "$project_root"
fi
exec "$agentforge_bin" "$subcommand" "$bundle_root" --scope project --project-root "$project_root"
`;
}

function assertNoCodexAgentBundleSetupSkillCollision(packageInput: CompilationPackage): void {
  const collidingSkill = (packageInput.artifacts.get('skill') ?? []).find((artifact) => {
    const parsed = matter(artifact.content);
    return parsed.data.name === CODEX_AGENT_BUNDLE_SETUP_SKILL;
  });
  const collidingCommand = (packageInput.artifacts.get('command') ?? []).find(
    (artifact) =>
      parseCommandBehavior(artifact.path, artifact.content).name === CODEX_AGENT_BUNDLE_SETUP_SKILL,
  );
  const collision = collidingSkill ?? collidingCommand;
  if (collision) {
    throw new CompilationError(
      `package ${JSON.stringify(packageInput.id)} enables a Codex agent bundle, which reserves skill name ${JSON.stringify(CODEX_AGENT_BUNDLE_SETUP_SKILL)}: ${collision.path}`,
    );
  }
}

function translateHookConfiguration({
  artifact,
  packageDirectory,
  packageInput,
}: ArtifactTranslatorInput): PackagePayloadResult {
  const source = parseHookDocument(artifact.path, artifact.content);
  const relativePath = relativePackageArtifactPath(packageInput.path, artifact.path);
  return translateHookDocument({
    artifact,
    artifactType: 'hook',
    destinationRelativePath: relativePath,
    locateEvents: true,
    packageDirectory,
    packageInput,
    relativePath,
    source,
  });
}

interface HookDocumentTranslationInput {
  artifact: ArtifactTranslatorInput['artifact'];
  artifactType: string;
  destinationRelativePath: string;
  locateEvents: boolean;
  packageDirectory: string;
  packageInput: ArtifactTranslatorInput['packageInput'];
  relativePath: string;
  source: z.infer<typeof ClaudeHookDocument>;
}

function translateHookDocument({
  artifact,
  artifactType,
  destinationRelativePath,
  locateEvents,
  packageDirectory,
  packageInput,
  relativePath,
  source,
}: HookDocumentTranslationInput): PackagePayloadResult {
  const diagnostics: ProposedCompilationDiagnostic[] = [];
  const hooks: Record<string, unknown[]> = {};
  const translatedEvents: string[] = [];
  const sourceText = JSON.stringify(source);

  // A structured artifact reports its own constructs: the prose detector does
  // not scan hook configs, so without this the rewrite below would be invisible
  // in the compile report (ndr:4nshwv rules out declaring it, not reporting it).
  for (const [token, becomes] of HOOK_ENV_TRANSLATIONS) {
    if (!sourceText.includes(token)) continue;
    diagnostics.push({
      code: 'translated-construct',
      severity: 'note',
      packageId: packageInput.id,
      message: `Claude-only construct "${token}" in ${relativePath} is translated to ${becomes} for target "codex"; nothing is lost, so no declared loss is required.`,
      retainedSource: { artifactType, sourcePath: artifact.path },
    });
  }

  for (const [event, groups] of Object.entries(source.hooks ?? {})) {
    const support = supportFor('codex', 'hook', event);
    const eventLocation = locateEvents
      ? locateHookEventKey(artifact.path, artifact.content, event)
      : undefined;
    if (support !== 'supported') {
      // Two different claims, kept apart for the reason ndr:szdn5s keeps
      // `unclassified-body-construct` apart from `claude-only-body-feature`:
      // "we established Codex does not fire this" and "we have never ruled on
      // this event" are not the same fact, and collapsing them would let an
      // unreviewed event read as a confirmed absence. Neither gates the
      // compile; both drop the event, because emitting a handler for an event
      // the target may never fire is the worse failure.
      diagnostics.push(
        support === 'unsupported'
          ? {
              code: 'unsupported-hook-event',
              severity: 'warning',
              packageId: packageInput.id,
              message: `Hook event "${event}" in ${relativePath} has no Codex analog and is absent from Codex output.`,
              retainedSource: { artifactType, sourcePath: artifact.path },
              ...(eventLocation === undefined ? {} : { locations: [eventLocation] }),
            }
          : {
              code: 'unclassified-hook-event',
              severity: 'warning',
              packageId: packageInput.id,
              message: `Hook event "${event}" in ${relativePath} is not classified by the "codex/hook" capability table row, so whether Codex fires it is unestablished; the event is absent from Codex output. Add a table row entry once confirmed.`,
              retainedSource: { artifactType, sourcePath: artifact.path },
              ...(eventLocation === undefined ? {} : { locations: [eventLocation] }),
            },
      );
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
            retainedSource: { artifactType, sourcePath: artifact.path },
            ...(eventLocation === undefined ? {} : { locations: [eventLocation] }),
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
            retainedSource: { artifactType, sourcePath: artifact.path },
            ...(eventLocation === undefined ? {} : { locations: [eventLocation] }),
          });
        }
        if (artifactType === 'skill' && handler.once !== undefined) {
          diagnostics.push({
            code: 'unsupported-artifact-hook-once',
            severity: 'warning',
            packageId: packageInput.id,
            message: `Skill hook handler for "${event}" in ${relativePath} declares "once", which Codex package hooks cannot preserve; the field is absent from Codex output.`,
            retainedSource: { artifactType, sourcePath: artifact.path },
            ...(eventLocation === undefined ? {} : { locations: [eventLocation] }),
          });
        }
        const { args, once: _once, ...rest } = handler;
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
    // A modules-only document is not empty: its loss is the declared-loss
    // gate's to report, as `hook-module`.
    if (Object.keys(source.hooks ?? {}).length === 0 && source.modules === undefined) {
      diagnostics.push({
        code: 'empty-hook-configuration',
        severity: 'note',
        packageId: packageInput.id,
        message: `Hook configuration ${relativePath} declares no events; nothing was projected for Codex.`,
        retainedSource: { artifactType, sourcePath: artifact.path },
      });
    }
    return { outputs: [], diagnostics, hookPaths: [] };
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
        destination: `${packageDirectory}/${destinationRelativePath}`,
        content: serialize(translated),
      },
    ],
    diagnostics: [
      {
        code: 'inferred-artifact-projection',
        severity: 'note',
        packageId: packageInput.id,
        message: `Hook configuration ${relativePath} translated into Codex's handler schema for ${translatedEvents.join(', ')}; Codex skips plugin-bundled hooks until the user reviews and trusts the definition.`,
        retainedSource: { artifactType, sourcePath: artifact.path },
      },
      ...diagnostics,
    ],
    hookPaths: [`./${destinationRelativePath}`],
  };
}

function translateArtifactHooks(
  input: ArtifactTranslatorInput,
  artifactType: 'skill' | 'agent',
): PackagePayloadResult {
  const { artifact, packageDirectory, packageInput } = input;
  const frontmatter = matter(artifact.content).data as Record<string, unknown>;
  if (frontmatter.hooks === undefined) return { outputs: [], diagnostics: [] };

  const artifactName =
    artifactType === 'agent'
      ? parseAgentBehavior(artifact.path, artifact.content).name
      : typeof frontmatter.name === 'string' && frontmatter.name.length > 0
        ? frontmatter.name
        : basename(dirname(artifact.path));
  const relativePath = relativePackageArtifactPath(packageInput.path, artifact.path);
  const destinationRelativePath = `hooks/${artifactType}s/${artifactName}.json`;
  const rawHooks = frontmatter.hooks;
  const hooks =
    artifactType === 'agent' && isRecord(rawHooks) && Array.isArray(rawHooks.Stop)
      ? convertAgentStopEvent(rawHooks)
      : rawHooks;
  const source = parseDocument(
    ClaudeHookDocument,
    { hooks },
    `inline ${artifactType} hook configuration ${artifact.path}`,
  );
  const translated = translateHookDocument({
    artifact,
    artifactType,
    destinationRelativePath,
    locateEvents: false,
    packageDirectory,
    packageInput,
    relativePath,
    source,
  });
  const diagnostics: ProposedCompilationDiagnostic[] = [
    {
      code: 'translated-construct',
      severity: 'note',
      packageId: packageInput.id,
      message: `Canonical ${artifactType} frontmatter "hooks" in ${relativePath} is projected to package hook ./${destinationRelativePath}; handler form is translated, while activation-scope loss is reported separately.`,
      retainedSource: { artifactType, sourcePath: artifact.path },
    },
    {
      code: 'artifact-hook-scope-widened',
      severity: 'warning',
      packageId: packageInput.id,
      message:
        artifactType === 'skill'
          ? `Skill hooks in ${relativePath} activate only after that skill is invoked on Claude, but Codex loads ./${destinationRelativePath} for the whole enabled package; the hook can fire before or without skill invocation. Tool-name matcher gaps remain documented in docs/hook-event-parity.md (L-009).`
          : `Agent hooks in ${relativePath} run only while that agent is active on Claude, but Codex loads ./${destinationRelativePath} for the whole enabled package; the hook can fire in the main thread and other agents. Tool-name matcher gaps remain documented in docs/hook-event-parity.md (L-009).`,
      retainedSource: { artifactType, sourcePath: artifact.path },
    },
  ];
  if (artifactType === 'agent' && isRecord(rawHooks) && Array.isArray(rawHooks.Stop)) {
    diagnostics.push({
      code: 'translated-construct',
      severity: 'note',
      packageId: packageInput.id,
      message: `Agent hook event "Stop" in ${relativePath} is translated to "SubagentStop", matching Claude's runtime conversion before the package-level scope widening is applied.`,
      retainedSource: { artifactType, sourcePath: artifact.path },
    });
  }

  return {
    ...translated,
    diagnostics: [...diagnostics, ...translated.diagnostics],
    externallyProjectedFrontmatterKeys: new Set(['hooks']),
  };
}

function convertAgentStopEvent(hooks: Record<string, unknown>): Record<string, unknown> {
  const { Stop, SubagentStop, ...rest } = hooks;
  return {
    ...rest,
    SubagentStop: [
      ...(Array.isArray(SubagentStop) ? SubagentStop : []),
      ...(Array.isArray(Stop) ? Stop : []),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

// A hook diagnostic names the offending event in its message, but
// `retainedSource` only carries the file, so on a `hooks.json` declaring a
// dozen events the reader gets the file and then scans. `hooks.json` goes
// through `JSON.parse` (no position-aware parse in hand at this call site),
// so this re-scans the raw text for the event name anchored in *key*
// position: `"<event>"` immediately followed by `:`. That excludes the
// far more common case of the event name showing up inside a `command`
// string or a matcher, where it is never followed by a colon. It is still
// heuristic — an event name could in principle appear as `"<event>":` inside
// a string value too — and that risk is accepted deliberately: the exact
// alternative is a position-aware JSON parse run beside the existing zod one,
// which this file does not take on. The event name in the message remains the
// real identifier, so a close-but-wrong line is still a useful jump target.
// No match found (event declared via dynamic construction, minified onto one
// shared line as a decoy, etc.) means `undefined`, and callers omit
// `locations` rather than guess.
//
// A duplicate top-level key scans to its LAST occurrence, matching
// `JSON.parse`, which keeps the last duplicate key's value: `source.hooks`
// (built by that same parse) reflects the second declaration, so the location
// has to agree with the object the parser actually produced, not the first
// textual match.
function locateHookEventKey(
  sourcePath: string,
  content: string,
  event: string,
): SourceLocation | undefined {
  const keyPattern = new RegExp(`"${escapeRegExp(event)}"\\s*:`);
  const lines = content.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    if (keyPattern.test(lines[index])) {
      return { path: sourcePath, line: index + 1 };
    }
  }
  return undefined;
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

// Codex plugin packages cannot register agent roles: codex-cli 0.155.1's
// plugin manifest path set (skills, onboarding skill, MCP servers, apps, hooks)
// has no agents/roles field, and no plugin config layer contributes an agents
// directory to the native role loader. There is no
// native registration this translator could target instead, so a package
// agent still becomes a plain Markdown procedure file — the fallback
// `ndr:msdg46` names, not a placeholder for one. Revisit if a future Codex
// release adds a `ConfigLayerSource::Plugin` variant or an `agents` field to
// the plugin manifest.
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
        message: `Agent "${agent.name}" inferred as a reusable Codex procedure; Codex plugin packages cannot register agent roles, so this file is not registered as a Codex agent role and Claude model, turn, and tool constraints remain in the retained source, unenforced by Codex (docs/limitations.md L-010).`,
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
function materializedHookPaths(payload: PackagePayloadResult | undefined): string[] {
  if (!payload) return [];
  return [...new Set(payload.hookPaths ?? [])].toSorted(compareStrings);
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
