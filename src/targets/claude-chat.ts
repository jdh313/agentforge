import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import type { TargetAdapter } from './index.ts';

const ClaudeChatOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string().min(1).max(200),
});

export const claudeChatTarget: TargetAdapter = {
  name: 'claude-chat',
  artifacts: {
    skill: {
      outputBaseDir: () => join(homedir(), 'Downloads/claude-skills'),
      allowedFrontmatterKeys: COMMON_KEYS,
      resourceSubdirs: new Set(['scripts', 'references', 'assets']),
      outputFrontmatterSchema: ClaudeChatOutputFrontmatter,
      bundle: 'zip',
    },
  },
};
