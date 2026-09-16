import { join } from 'node:path';
import { z } from 'zod';
import type { TargetAdapter } from '../target-adapter.ts';

// Loose for the same reason ndr:17dhph keeps generated native documents loose:
// acceptance is decided by the checked-in key set before this schema validates
// recognized values. Unknown native fields do not make the validator own a
// closed copy of Claude's full document grammar.
const ClaudeSkillFrontmatter = z.looseObject({
  name: z.string().optional(),
  description: z.string(),
  when_to_use: z.string().optional(),
  'argument-hint': z.string().optional(),
  arguments: z.union([z.string(), z.array(z.string())]).optional(),
  'disable-model-invocation': z.boolean().optional(),
  'user-invocable': z.boolean().optional(),
  'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  'disallowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  context: z.enum(['fork']).optional(),
  agent: z.string().optional(),
  hooks: z.unknown().optional(),
  paths: z.union([z.string(), z.array(z.string())]).optional(),
  shell: z.enum(['bash', 'powershell']).optional(),
});

const ClaudeOutputStyleFrontmatter = z.looseObject({
  name: z.string().optional(),
  description: z.string(),
  'keep-coding-instructions': z.boolean().optional(),
  'force-for-plugin': z.boolean().optional(),
});

const ClaudeAgentFrontmatter = z.looseObject({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'name must be a lowercase hyphenated identifier'),
  description: z.string().min(1),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  model: z.string().min(1).optional(),
  maxTurns: z.number().int().positive().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});

export const claudeTarget: TargetAdapter = {
  name: 'claude',
  label: 'Claude',
  artifacts: {
    skill: {
      installLocations: {
        user: ({ homeDirectory }) => join(homeDirectory, '.claude/skills'),
        project: ({ projectRoot }) => join(projectRoot, '.claude/skills'),
        plugin: ({ pluginRoot }) => requirePluginRoot(pluginRoot, 'claude'),
      },
      surface: 'skill',
      resourceSubdirs: new Set(['scripts', 'references', 'assets']),
      outputFrontmatterSchema: ClaudeSkillFrontmatter,
    },
    agent: {
      installLocations: {
        user: ({ homeDirectory }) => join(homeDirectory, '.claude/agents'),
        project: ({ projectRoot }) => join(projectRoot, '.claude/agents'),
      },
      surface: 'agent',
      resourceSubdirs: new Set(),
      outputFrontmatterSchema: ClaudeAgentFrontmatter,
    },
    'output-style': {
      installLocations: {},
      surface: 'skill',
      resourceSubdirs: new Set(),
      outputFrontmatterSchema: ClaudeOutputStyleFrontmatter,
    },
  },
};

function requirePluginRoot(pluginRoot: string | undefined, target: string): string {
  if (pluginRoot === undefined) {
    throw new Error(`install scope plugin for target ${target} requires --plugin-root <dir>`);
  }
  return join(pluginRoot, 'skills');
}
