import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { CanonicalAgentBehavior } from '../agent-command.ts';
import { CanonicalAgentName, EffortLevel, LoaderBoolean, ToolList } from '../schema.ts';
import {
  agentSkillsTarget,
  type NativeAgentDocument,
  type NativeAgentDocumentContext,
  ProjectionRefusedError,
  type TargetAdapter,
} from '../target-adapter.ts';
import type { Warning } from '../types.ts';

const PiOutputFrontmatter = z.looseObject({
  name: z.string().optional(),
  description: z.string(),
  'disable-model-invocation': z.boolean().optional(),
});

// Core Pi 1.0.2 reads no agent files. The Pi `agent` artifact projects to the
// third-party extension below, and the mapping is a claim about that one
// version's loader: the loader ignores every key it does not read without a
// warning, so drift in a later major would not surface as an error anywhere
// (ndr:az33k6). Bumping this constant is a re-verification, not a version
// edit; `docs/field-parity.md` and `docs/limitations.md` (L-015) cite it.
export const PI_SUBAGENTS_PACKAGE = '@gotgenes/pi-subagents';
export const PI_SUBAGENTS_VERSION = '23.2.0';

// The keys the loader reads that agentforge emits. `name` is absent on
// purpose: the loader takes the name from the filename stem. The Pi-only keys
// (`display_name`, `prompt_mode`, `inherit_context`, `enabled`, `locked`) have
// no canonical source and are not emitted until a need names them.
const PiAgentOutputFrontmatter = z.looseObject({
  name: CanonicalAgentName,
  description: z.string().min(1),
  effort: EffortLevel.optional(),
  maxTurns: z.number().int().positive().optional(),
  background: LoaderBoolean.optional(),
});

// The loader treats a boolean `true` strictly (`=== true`), so the canonical
// loader-boolean strings are normalized rather than passed through.
const loaderBoolean = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

// ndr:jybfry: a tool or permission restriction is a safety property, and the
// extension has no denylist, no permission mode and an omitted `tools` means
// all seven built-in tools, so losing one widens the agent. A shared `tools`
// is in Claude names the loader matches against nothing, a non-empty
// `disallowedTools` is never read, and every `permissionMode` except
// `bypassPermissions` asks or denies on Claude where Pi asks nothing. Any of
// them without a Pi allowlist the author wrote is refused rather than
// stripped. An empty `disallowedTools` restricts nothing and does not count.
// `targets.pi.tools` satisfies the gate for all three keys (they are still
// reported as not accepted by the generic path).
function restrictingKeys(frontmatter: Readonly<Record<string, unknown>>): string[] {
  const keys: string[] = [];
  if (frontmatter.tools != null) keys.push('tools');
  const denied = frontmatter.disallowedTools;
  if (denied !== undefined && !(Array.isArray(denied) && denied.length === 0)) {
    keys.push('disallowedTools');
  }
  const mode = frontmatter.permissionMode;
  if (mode !== undefined && mode !== 'bypassPermissions') keys.push('permissionMode');
  return keys;
}

function assertRestrictionIsExpressible(
  name: string,
  sourcePath: string,
  frontmatter: Readonly<Record<string, unknown>>,
  piTools: string | string[] | undefined,
): void {
  if (piTools !== undefined) return;
  const restricting = restrictingKeys(frontmatter);
  if (restricting.length === 0) return;
  throw new ProjectionRefusedError(
    `${sourcePath}: refusing to render agent ${JSON.stringify(name)} for pi: ${restricting.join(', ')} restrict${restricting.length === 1 ? 's' : ''} what it may do but no targets.pi.tools is set. ${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} has no tool denylist or permission mode and matches tool names exactly, so a Claude-named list matches nothing and an omitted list grants all built-in tools. Add targets.pi.tools with Pi tool names (for example [read, grep]).`,
  );
}

// `null` is an absent override (a YAML key written with no value); any other
// non-list, non-string value is a refusal so `--all-targets` skips Pi rather
// than aborting the run.
function parsePiTools(sourcePath: string, value: unknown): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = ToolList.safeParse(value);
  if (!parsed.success) {
    throw new ProjectionRefusedError(
      `${sourcePath}: targets.pi.tools must be a string or a list of strings`,
    );
  }
  return parsed.data;
}

const piAgentDocument: NativeAgentDocument = {
  extension: '.md',
  serialize(
    behavior: CanonicalAgentBehavior,
    { sourcePath, overrides, sharedFrontmatter }: NativeAgentDocumentContext,
  ) {
    const tools = parsePiTools(sourcePath, overrides.tools);
    // A null override (`targets.pi.permissionMode:` with no value) erases the
    // shared key in the merged view; the gate falls back to the shared value.
    const effective = Object.fromEntries(
      Object.keys({ ...sharedFrontmatter, ...behavior.sourceFrontmatter }).map((key) => [
        key,
        behavior.sourceFrontmatter[key] ?? sharedFrontmatter[key],
      ]),
    );
    assertRestrictionIsExpressible(behavior.name, sourcePath, effective, tools);
    const background = loaderBoolean(behavior.sourceFrontmatter.background);
    // Fixed key order, so the output is deterministic and reads like the
    // extension's own documentation.
    const frontmatter: Record<string, unknown> = {
      description: behavior.description,
      ...(behavior.execution.model === undefined ? {} : { model: behavior.execution.model }),
      ...(tools === undefined ? {} : { tools }),
      ...(behavior.execution.effort === undefined ? {} : { thinking: behavior.execution.effort }),
      ...(behavior.execution.maxTurns === undefined
        ? {}
        : { max_turns: behavior.execution.maxTurns }),
      ...(background === undefined ? {} : { run_in_background: background }),
    };
    const warnings: Warning[] = [];
    if (behavior.execution.maxTurns === 1) {
      warnings.push({
        kind: 'pi-max-turns-raised',
        target: 'pi',
        detail: `maxTurns 1 is emitted as max_turns 1, but ${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} runs it as 2 (docs/limitations.md L-015)`,
      });
    }
    if (behavior.execution.maxTurns !== undefined) {
      warnings.push({
        kind: 'pi-caller-may-override',
        target: 'pi',
        detail: `maxTurns ${behavior.execution.maxTurns} is emitted as max_turns ${behavior.execution.maxTurns}, but ${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} lets the calling parent replace it per call, so it is a default and not a ceiling on the caller (docs/limitations.md L-016)`,
      });
    }
    return { content: matter.stringify(behavior.instructions, frontmatter), warnings };
  },
};

const piAgentSkills = agentSkillsTarget({
  name: 'pi',
  label: 'Pi',
  installLocations: {
    user: ({ homeDirectory }) => join(homeDirectory, '.pi/agent/skills'),
    project: ({ projectRoot }) => join(projectRoot, '.pi/skills'),
    plugin: ({ pluginRoot }) => {
      if (pluginRoot === undefined) {
        throw new Error('install scope plugin for target pi requires --plugin-root <dir>');
      }
      return join(pluginRoot, 'skills');
    },
  },
  outputFrontmatterSchema: PiOutputFrontmatter,
});

export const piTarget = {
  ...piAgentSkills,
  artifacts: {
    ...piAgentSkills.artifacts,
    agent: {
      // The extension discovers agents only in `$PI_CODING_AGENT_DIR/agents`
      // (default `~/.pi/agent/agents`) and `<cwd>/.pi/agents` (ndr:az33k6), so
      // those are the only scopes. Each
      // agent is one file in a directory that holds the user's other agents,
      // so install owns only its planned path (ndr:hjnabw). Project agents
      // load with no setting, but only when pi starts in the directory holding
      // `.pi/agents` (docs/pi-agent-acceptance.md, L-015).
      installLocations: {
        user: ({ homeDirectory, piAgentDirectory }) =>
          join(piAgentDirectory ?? join(homeDirectory, '.pi/agent'), 'agents'),
        project: ({ projectRoot }) => join(projectRoot, '.pi/agents'),
      },
      unsupportedInstallScopeReasons: {
        plugin: `${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} discovers agents only in ~/.pi/agent/agents and <cwd>/.pi/agents, not inside a Pi package, so a plugin root would hold files nothing reads`,
      },
      surface: 'agent' as const,
      resourceSubdirs: new Set<string>(),
      outputFrontmatterSchema: PiAgentOutputFrontmatter,
      nativeDocument: piAgentDocument,
      reportsTranslationOnlyKeys: true,
    },
  },
} satisfies TargetAdapter;
