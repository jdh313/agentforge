import type { z } from 'zod';
import type { TargetName } from '../types.ts';
import { claudeTarget } from './claude.ts';
import { codexTarget } from './codex.ts';
import { opencodeTarget } from './opencode.ts';

export interface TargetAdapter {
  name: TargetName;
  outputBaseDir(): string;
  allowedFrontmatterKeys: ReadonlySet<string>;
  resourceSubdirs: ReadonlySet<string>;
  outputFrontmatterSchema: z.ZodType;
}

const REGISTRY: Record<TargetName, TargetAdapter> = {
  claude: claudeTarget,
  opencode: opencodeTarget,
  codex: codexTarget,
};

export const getTarget = (name: TargetName): TargetAdapter => REGISTRY[name];

export const allTargets = (): TargetAdapter[] => Object.values(REGISTRY);
