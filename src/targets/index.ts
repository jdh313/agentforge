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
  // What to do with a canonical frontmatter key `allowedFrontmatterKeys` does
  // not list. Omitted means `strip`: emitting a key onto a target is a claim
  // that the target accepts it, and agentforge cannot make that claim about a
  // key it does not recognize. `retain` is an explicit per-target opt-in, held
  // today only by Claude, which is the source dialect — an unrecognized
  // canonical key is by construction a Claude key not yet enumerated here, so
  // withholding it from Claude loses data a runtime would have honored.
  // Either way the key is reported (`unrecognized-frontmatter-key`).
  unrecognizedFrontmatter?: 'retain' | 'strip';
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
