import type { z } from 'zod';
import type { ArtifactType, TargetName } from '../types.ts';
import { claudeTarget } from './claude.ts';
import { claudeChatTarget } from './claude-chat.ts';
import { codexTarget } from './codex.ts';
import { opencodeTarget } from './opencode.ts';

export interface ArtifactConfig {
  outputBaseDir(): string;
  allowedFrontmatterKeys: ReadonlySet<string>;
  resourceSubdirs: ReadonlySet<string>;
  outputFrontmatterSchema: z.ZodType;
  bundle?: 'dir' | 'zip';
}

export interface TargetAdapter {
  name: TargetName;
  artifacts: Partial<Record<ArtifactType, ArtifactConfig>>;
}

const REGISTRY: Record<TargetName, TargetAdapter> = {
  claude: claudeTarget,
  opencode: opencodeTarget,
  codex: codexTarget,
  'claude-chat': claudeChatTarget,
};

export const getTarget = (name: TargetName): TargetAdapter => REGISTRY[name];

export const allTargets = (): TargetAdapter[] => Object.values(REGISTRY);

export const getArtifactConfig = (
  target: TargetName,
  artifact: ArtifactType,
): ArtifactConfig | undefined => REGISTRY[target].artifacts[artifact];
