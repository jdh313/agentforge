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
  // A canonical frontmatter key the artifact's schema does not enumerate. Kept
  // separate from `claude-only-frontmatter-stripped` for the same reason
  // `unclassified-body-construct` is kept apart from `claude-only-body-feature`:
  // that warning asserts a construct we know Claude owns and the target loses,
  // and an unrecognized key supports neither half of that claim. Whether it was
  // retained or dropped is in the detail — the kind names what we do not know.
  | 'unrecognized-frontmatter-key'
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
