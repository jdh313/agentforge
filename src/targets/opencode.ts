import { join } from 'node:path';
import { z } from 'zod';
import { agentSkillsTarget } from '../target-adapter.ts';

const OpenCodeOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const opencodeTarget = agentSkillsTarget({
  name: 'opencode',
  label: 'OpenCode',
  installLocations: {
    user: ({ homeDirectory }) => join(homeDirectory, '.config/opencode/skills'),
    project: ({ projectRoot }) => join(projectRoot, '.opencode/skills'),
  },
  outputFrontmatterSchema: OpenCodeOutputFrontmatter,
});
