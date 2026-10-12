import { compileClaudePublication } from './claude-marketplace.ts';
import { compileCodexPublication } from './codex-marketplace.ts';
import { compilePiPackage } from './pi-package.ts';
import { attachMarketplace, attachPackage } from './registry.ts';

attachMarketplace('claude', { compilePublication: compileClaudePublication });
attachMarketplace('codex', { compilePublication: compileCodexPublication });
attachPackage('pi', { compilePackage: compilePiPackage });

export type { ArtifactConfig, TargetAdapter } from '../target-adapter.ts';
export { allTargets, getArtifactConfig, getTarget } from './registry.ts';
