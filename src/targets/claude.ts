import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ALL_CLAUDE_KEYS } from '../schema.ts';
import type { TargetAdapter } from './index.ts';

const ClaudeOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
  when_to_use: z.string().optional(),
  'argument-hint': z.string().optional(),
  arguments: z.union([z.string(), z.array(z.string())]).optional(),
  'disable-model-invocation': z.boolean().optional(),
  'user-invocable': z.boolean().optional(),
  'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  context: z.enum(['fork']).optional(),
  agent: z.string().optional(),
  hooks: z.unknown().optional(),
  paths: z.union([z.string(), z.array(z.string())]).optional(),
  shell: z.enum(['bash', 'powershell']).optional(),
});

export const claudeTarget: TargetAdapter = {
  name: 'claude',
  outputBaseDir: () => join(homedir(), '.claude/skills'),
  allowedFrontmatterKeys: ALL_CLAUDE_KEYS,
  resourceSubdirs: new Set(['scripts', 'references', 'assets']),
  outputFrontmatterSchema: ClaudeOutputFrontmatter,
};
