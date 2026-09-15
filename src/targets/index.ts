import { compileClaudePublication } from './claude-marketplace.ts';
import { compileCodexPublication } from './codex-marketplace.ts';
import { attachMarketplace } from './registry.ts';

attachMarketplace('claude', { compilePublication: compileClaudePublication });
attachMarketplace('codex', { compilePublication: compileCodexPublication });

export type { ArtifactConfig, TargetAdapter } from '../target-adapter.ts';
export { allTargets, getArtifactConfig, getTarget } from './registry.ts';
