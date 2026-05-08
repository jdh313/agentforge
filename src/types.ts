export type TargetName = 'claude' | 'opencode' | 'codex';

export const TARGET_NAMES: readonly TargetName[] = ['claude', 'opencode', 'codex'] as const;

export type WarningKind = 'claude-only-frontmatter-stripped' | 'claude-only-body-feature';

export interface Warning {
  kind: WarningKind;
  target: TargetName;
  detail: string;
}

export interface RenderResult {
  outputPath: string;
  resourcesCopied: string[];
  warnings: Warning[];
}
