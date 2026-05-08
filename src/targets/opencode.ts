import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import type { TargetAdapter } from './index.ts';

const OpenCodeOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const opencodeTarget: TargetAdapter = {
  name: 'opencode',
  outputBaseDir: () => join(homedir(), '.config/opencode/skills'),
  allowedFrontmatterKeys: COMMON_KEYS,
  resourceSubdirs: new Set(['scripts', 'references', 'assets']),
  outputFrontmatterSchema: OpenCodeOutputFrontmatter,
};
