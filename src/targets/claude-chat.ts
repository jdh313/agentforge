import { z } from 'zod';
import { agentSkillsTarget } from '../target-adapter.ts';

const ClaudeChatOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string().min(1).max(200),
});

export const claudeChatTarget = agentSkillsTarget({
  name: 'claude-chat',
  label: 'Claude Chat',
  installLocations: {},
  outputFrontmatterSchema: ClaudeChatOutputFrontmatter,
  bundle: 'zip',
});
