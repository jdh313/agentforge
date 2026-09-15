import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import { agentSkillsTarget } from '../target-adapter.ts';

const OpenCodeOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const opencodeTarget = agentSkillsTarget({
  name: 'opencode',
  label: 'OpenCode',
  outputBaseDir: () => join(homedir(), '.config/opencode/skills'),
  allowedFrontmatterKeys: COMMON_KEYS,
  outputFrontmatterSchema: OpenCodeOutputFrontmatter,
});
