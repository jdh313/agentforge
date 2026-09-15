import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import { agentSkillsTarget } from '../target-adapter.ts';

const ClaudeChatOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string().min(1).max(200),
});

export const claudeChatTarget = agentSkillsTarget({
  name: 'claude-chat',
  label: 'Claude Chat',
  outputBaseDir: () => join(homedir(), 'Downloads/claude-skills'),
  allowedFrontmatterKeys: COMMON_KEYS,
  outputFrontmatterSchema: ClaudeChatOutputFrontmatter,
  bundle: 'zip',
});
