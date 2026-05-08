import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { COMMON_KEYS } from '../schema.ts';
import type { TargetAdapter } from './index.ts';

const CodexOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

export const codexTarget: TargetAdapter = {
  name: 'codex',
  artifacts: {
    skill: {
      outputBaseDir: () => join(homedir(), '.agents/skills'),
      allowedFrontmatterKeys: COMMON_KEYS,
      resourceSubdirs: new Set(['scripts', 'references', 'assets']),
      outputFrontmatterSchema: CodexOutputFrontmatter,
    },
  },
};
