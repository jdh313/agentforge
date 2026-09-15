import { join } from 'node:path';
import { z } from 'zod';
import { agentSkillsTarget } from '../target-adapter.ts';

const PiOutputFrontmatter = z.looseObject({
  name: z.string().optional(),
  description: z.string(),
  'allowed-tools': z.string().optional(),
  'disable-model-invocation': z.boolean().optional(),
});

export const piTarget = agentSkillsTarget({
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
