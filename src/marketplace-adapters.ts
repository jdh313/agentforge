import { asCompilerAdapter } from './target-adapter.ts';
import { getTarget } from './targets/index.ts';

export const claudeMarketplaceAdapter = asCompilerAdapter(getTarget('claude'));
export const codexMarketplaceAdapter = asCompilerAdapter(getTarget('codex'));
