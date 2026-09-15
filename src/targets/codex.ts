import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import { agentSkillsTarget } from '../target-adapter.ts';

const CodexOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const codexTarget = agentSkillsTarget({
  name: 'codex',
  label: 'Codex',
  outputBaseDir: () => join(homedir(), '.agents/skills'),
  allowedFrontmatterKeys: COMMON_KEYS,
  outputFrontmatterSchema: CodexOutputFrontmatter,
});
