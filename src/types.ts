export type TargetName = 'claude' | 'opencode' | 'codex' | 'claude-chat';

export const TARGET_NAMES: readonly TargetName[] = [
  'claude',
  'opencode',
  'codex',
  'claude-chat',
] as const;

export type ArtifactType = 'skill' | 'output-style';

export const ARTIFACT_TYPES: readonly ArtifactType[] = ['skill', 'output-style'] as const;

export type WarningKind =
  | 'claude-only-frontmatter-stripped'
  | 'claude-only-body-feature'
  | 'artifact-not-supported';

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
