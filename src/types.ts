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
  // Construct-shaped but unclassified. Kept separate from
  // `claude-only-body-feature` so "we know this is lost" and "we do not
  // recognize this" stay distinguishable — collapsing them would make an
  // ordinary `$PATH` read as a confirmed Claude-only loss.
  | 'unclassified-body-construct'
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
