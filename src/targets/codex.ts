import { join } from 'node:path';
import { z } from 'zod';
import { agentSkillsTarget } from '../target-adapter.ts';

const CodexOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const codexTarget = agentSkillsTarget({
  name: 'codex',
  label: 'Codex',
  installLocations: {
    user: ({ homeDirectory }) => join(homeDirectory, '.agents/skills'),
    project: ({ projectRoot }) => join(projectRoot, '.agents/skills'),
    plugin: ({ pluginRoot }) => {
      if (pluginRoot === undefined) {
        throw new Error('install scope plugin for target codex requires --plugin-root <dir>');
      }
      return join(pluginRoot, 'skills');
    },
  },
  outputFrontmatterSchema: CodexOutputFrontmatter,
});
