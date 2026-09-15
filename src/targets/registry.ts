import type { ArtifactConfig, MarketplaceCapability, TargetAdapter } from '../target-adapter.ts';
import type { ArtifactType, TargetName } from '../types.ts';
import { claudeTarget } from './claude.ts';
import { claudeChatTarget } from './claude-chat.ts';
import { codexTarget } from './codex.ts';
import { opencodeTarget } from './opencode.ts';

// The only target enumeration in AgentForge. Marketplace capabilities attach
// during full registry assembly, after leaf projection dependencies have
// initialized; projection itself can safely consult this registry without
// entering a marketplace-module cycle.
const REGISTRY: Record<TargetName, TargetAdapter> = {
  claude: claudeTarget,
  opencode: opencodeTarget,
  codex: codexTarget,
  'claude-chat': claudeChatTarget,
};

export function attachMarketplace(target: TargetName, capability: MarketplaceCapability): void {
  REGISTRY[target].marketplace = capability;
}

export const getTarget = (name: TargetName): TargetAdapter => REGISTRY[name];

export const allTargets = (): TargetAdapter[] => Object.values(REGISTRY);

export const getArtifactConfig = (
  target: TargetName,
  artifact: ArtifactType,
): ArtifactConfig | undefined => REGISTRY[target].artifacts[artifact];
