import type { SourceLocation } from './compiler.ts';

export type TargetName = 'claude' | 'opencode' | 'codex' | 'pi' | 'claude-chat';

export type InstallScope = 'user' | 'project' | 'plugin';

export const INSTALL_SCOPES: readonly InstallScope[] = ['user', 'project', 'plugin'] as const;

export type ConstructSurface = 'skill' | 'agent' | 'prompt' | 'hook';

export const TARGET_NAMES: readonly TargetName[] = [
  'claude',
  'opencode',
  'codex',
  'pi',
  'claude-chat',
] as const;

export type ArtifactType = 'skill' | 'agent' | 'output-style';

export const ARTIFACT_TYPES: readonly ArtifactType[] = ['skill', 'agent', 'output-style'] as const;

// The closed vocabulary every compiler diagnostic's `code` is drawn from
// (ndr:bqh2gz). `src/report.ts`'s `DISPOSITION_BY_CODE` is required by the
// type checker to be total over this union, so a member added here without a
// matching disposition entry fails the build rather than drifting silently.
// The renderer's `WarningKind` below is a subset of this same union — never a
// second union assigned into the `code` field — because the renderer and the
// compiler share one runtime vocabulary of codes.
export type DiagnosticCode =
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
  // A construct the target supports only when a typed condition holds.
  // Distinct from every kind above, which reports an unconditional target
  // outcome: this warning carries the gate rather than averaging over it, and
  // therefore never enters the declared-loss path (ndr:k58f71).
  | 'construct-support-gated'
  // Compiler-only codes below: never assigned from a leaf `Warning.kind`, so
  // they are outside `WarningKind`'s `Extract` even though they share this
  // union.
  | 'supplied-output-override'
  | 'translated-construct'
  | 'unsupported-hook-event'
  | 'unclassified-hook-event'
  | 'translated-hook-handler-args'
  | 'hook-timeout-capped-by-runtime'
  | 'artifact-hook-scope-widened'
  | 'unsupported-artifact-hook-once'
  | 'empty-hook-configuration'
  | 'inferred-artifact-projection'
  | 'unclassified-construct'
  | 'declared-loss'
  | 'unsupported-artifact-projection';

// The renderer's warning vocabulary, derived rather than re-declared
// (ndr:bqh2gz): every member here is a `DiagnosticCode`, and the renderer can
// never mint a code the compiler's union does not already carry.
export type WarningKind = Extract<
  DiagnosticCode,
  | 'claude-only-frontmatter-stripped'
  | 'claude-only-body-feature'
  | 'unclassified-body-construct'
  | 'unrecognized-frontmatter-key'
  | 'construct-support-gated'
>;

export interface Warning {
  kind: WarningKind;
  target: TargetName;
  detail: string;
  // Per-occurrence positions, when the detector that raised this warning knows
  // them. Absent means file-granularity only (e.g. a frontmatter key, which
  // has no line that identifies it — see `src/compatibility.ts`).
  locations?: readonly SourceLocation[];
}

export interface RenderResult {
  outputPath: string;
  resourcesCopied: string[];
  warnings: Warning[];
}
