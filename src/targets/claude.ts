import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ALL_CLAUDE_KEYS, OUTPUT_STYLE_KEYS } from '../schema.ts';
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

export const claudeTarget: TargetAdapter = {
  name: 'claude',
  label: 'Claude',
  artifacts: {
    skill: {
      outputBaseDir: () => join(homedir(), '.claude/skills'),
      surface: 'skill',
      allowedFrontmatterKeys: ALL_CLAUDE_KEYS,
      resourceSubdirs: new Set(['scripts', 'references', 'assets']),
      outputFrontmatterSchema: ClaudeSkillFrontmatter,
    },
    'output-style': {
      outputBaseDir: () => join(homedir(), '.claude/output-styles'),
      surface: 'skill',
      allowedFrontmatterKeys: OUTPUT_STYLE_KEYS,
      resourceSubdirs: new Set(),
      outputFrontmatterSchema: ClaudeOutputStyleFrontmatter,
    },
  },
};
