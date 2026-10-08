import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { CanonicalAgentBehavior } from '../agent-command.ts';
import { CanonicalAgentName } from '../schema.ts';
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
  'allowed-tools': z.string().optional(),
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
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  maxTurns: z.number().int().positive().optional(),
  background: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

const PiToolList = z.union([z.string(), z.array(z.string())]);

// The loader treats a boolean `true` strictly (`=== true`), so the canonical
// loader-boolean strings are normalized rather than passed through.
const loaderBoolean = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

// ndr:yvgjpt: a tool restriction is a safety property and the extension has no
// denylist, so losing one widens the agent to all seven built-in tools. A
// shared `tools` is in Claude names the loader matches against nothing, and
// `disallowedTools` is never read; either one without a Pi allowlist the
// author wrote is refused rather than stripped. `targets.pi.tools` satisfies
// the gate even when a shared `disallowedTools` remains (that key is still
// reported as not accepted by the generic path).
function assertRestrictionIsExpressible(
  name: string,
  sourcePath: string,
  frontmatter: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>>,
): void {
  if (overrides.tools !== undefined) return;
  const restricting = ['tools', 'disallowedTools'].filter((key) => frontmatter[key] !== undefined);
  if (restricting.length === 0) return;
  throw new ProjectionRefusedError(
    `${sourcePath}: refusing to render agent ${JSON.stringify(name)} for pi: ${restricting.join(' and ')} restrict${restricting.length === 1 ? 's' : ''} its tools but no targets.pi.tools is set. ${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} has no tool denylist and matches tool names exactly, so a Claude-named list matches nothing and an omitted list grants all built-in tools. Add targets.pi.tools in Pi tool names (for example [read, grep]).`,
  );
}

const piAgentDocument: NativeAgentDocument = {
  extension: '.md',
  serialize(
    behavior: CanonicalAgentBehavior,
    { sourcePath, overrides }: NativeAgentDocumentContext,
  ) {
    assertRestrictionIsExpressible(
      behavior.name,
      sourcePath,
      behavior.sourceFrontmatter,
      overrides,
    );
    const tools =
      overrides.tools === undefined
        ? undefined
        : (() => {
            const parsed = PiToolList.safeParse(overrides.tools);
            if (!parsed.success) {
              throw new Error(
                `${sourcePath}: targets.pi.tools must be a string or a list of strings`,
              );
            }
            return parsed.data;
          })();
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
    const warnings: Warning[] =
      behavior.execution.maxTurns === 1
        ? [
            {
              kind: 'pi-max-turns-raised',
              target: 'pi',
              detail: `maxTurns 1 is emitted as max_turns 1, but ${PI_SUBAGENTS_PACKAGE} ${PI_SUBAGENTS_VERSION} runs it as 2 (docs/limitations.md L-015)`,
            },
          ]
        : [];
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
      // Render only (Fibery #139). The extension discovers agents in
      // `~/.pi/agent/agents` and `<cwd>/.pi/agents`, but declaring those here
      // would make `install` write them, and the install lifecycle is #140.
      // An empty map is the output-style precedent: standalone render works,
      // install reports there is no installable scope.
      installLocations: {},
      surface: 'agent' as const,
      resourceSubdirs: new Set<string>(),
      outputFrontmatterSchema: PiAgentOutputFrontmatter,
      nativeDocument: piAgentDocument,
      reportsTranslationOnlyKeys: true,
    },
  },
} satisfies TargetAdapter;
