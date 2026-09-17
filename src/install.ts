import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildArtifactPlan } from './artifact-plan.ts';
import {
  checkCompilationOutputs,
  checkCompilationSnapshot,
  type MarketplaceCheckIssue,
  type MarketplaceCheckResult,
} from './check.ts';
import type { CompilationPlan } from './compiler.ts';
import { canonicalOutput, detectInstallCollision } from './install-collision.ts';
import {
  type MaterializationResult,
  materializeCompilation,
  materializeCompilationOutputs,
} from './materializer.ts';
import { loadArtifactProjection } from './render.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { ArtifactType, InstallScope, TargetName } from './types.ts';

export interface BuildInstallPlanOptions {
  sourceDir: string;
  target: TargetName;
  artifact: ArtifactType;
  scope: InstallScope;
  projectRoot: string;
  pluginRoot?: string;
  homeDirectory?: string;
}

export interface InstallPlan {
  sourceDir: string;
  artifact: ArtifactType;
  target: TargetName;
  scope: InstallScope;
  homeDirectory: string;
  projectRoot: string;
  pluginRoot?: string;
  destinationRoot: string;
  ownership: 'snapshot' | 'planned-files';
  plan: CompilationPlan;
}

export class InstallCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallCollisionError';
  }
}

/** Build the single-artifact synthetic publication used by install and check-install. */
export function buildInstallPlan(options: BuildInstallPlanOptions): InstallPlan {
  const sourceDir = resolve(options.sourceDir);
  const config = getArtifactConfig(options.target, options.artifact);
  if (!config) {
    throw new Error(`target ${options.target} does not support artifact ${options.artifact}`);
  }
  const location = config.installLocations[options.scope];
  if (!location) {
    // The scopes this target does support are read off the same declarations
    // the refusal consulted, never restated. A target's reason for omitting a
    // scope stays in that target's module and its limitations entry
    // (ndr:nes397) — shared code may name the alternatives, not explain them.
    const supported = Object.keys(config.installLocations);
    const alternative =
      supported.length > 0
        ? `supported scopes for this artifact: ${supported.join(', ')}`
        : 'this artifact has no installable scope on this target';
    throw new Error(
      `target ${options.target} does not support ${options.scope}-scope installation for artifact ${options.artifact}; ${alternative}`,
    );
  }

  const projection = loadArtifactProjection({
    sourceDir,
    target: options.target,
    artifact: options.artifact,
  });
  const planned = buildArtifactPlan({
    sourceDir,
    target: options.target,
    artifact: options.artifact,
    publicationId: 'install',
    projection,
  });
  const artifactDef = ARTIFACT_DEFS[options.artifact];
  if (
    artifactDef.layout === 'directory' &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planned.artifactName)
  ) {
    throw new Error(
      `artifact name ${JSON.stringify(planned.artifactName)} is not a portable skill directory name`,
    );
  }
  const resolvedHomeDirectory = resolve(options.homeDirectory ?? homedir());
  const resolvedProjectRoot = resolve(options.projectRoot);
  const resolvedPluginRoot =
    options.pluginRoot === undefined ? undefined : resolve(options.pluginRoot);
  const locationRoot = location({
    homeDirectory: resolvedHomeDirectory,
    projectRoot: resolvedProjectRoot,
    ...(resolvedPluginRoot === undefined ? {} : { pluginRoot: resolvedPluginRoot }),
  });
  const destinationRoot =
    artifactDef.layout === 'directory' ? join(locationRoot, planned.artifactName) : locationRoot;

  return {
    sourceDir,
    artifact: options.artifact,
    target: options.target,
    scope: options.scope,
    homeDirectory: resolvedHomeDirectory,
    projectRoot: resolvedProjectRoot,
    ...(resolvedPluginRoot === undefined ? {} : { pluginRoot: resolvedPluginRoot }),
    destinationRoot,
    ownership: artifactDef.layout === 'directory' ? 'snapshot' : 'planned-files',
    plan: planned.plan,
  };
}

/**
 * A plugin skills/ directory (and, in principle, any other shared
 * destination) is read by every harness projected there and holds exactly
 * one copy. Detect before staging or swapping anything — a cross-target
 * collision must refuse the write outright, not partially apply it.
 */
function collisionMessage(
  install: InstallPlan,
  collidingTarget: TargetName,
  differs?: string,
): string {
  // One line, like every other check-issue message: cli.ts formats an issue as
  // a single console.error call and report.ts emits it as one indented
  // continuation line, so an embedded newline corrupts both.
  const detail = differs === undefined ? '' : ` (differs: ${differs})`;
  return (
    `${install.destinationRoot} already holds the ${JSON.stringify(collidingTarget)} projection ` +
    `of this source, which differs from ${JSON.stringify(install.target)} — a shared install ` +
    `destination holds one copy; use a separate --plugin-root (or other destination) per ` +
    `target${detail}`
  );
}

export function materializeInstallPlan(install: InstallPlan): MaterializationResult {
  const collision = detectInstallCollision(install);
  if (collision) {
    throw new InstallCollisionError(
      collisionMessage(install, collision.collidingTarget, collision.differs),
    );
  }
  return install.ownership === 'snapshot'
    ? materializeCompilation(install.plan, install.destinationRoot)
    : materializeCompilationOutputs(install.plan, install.destinationRoot);
}

export function checkInstallPlan(install: InstallPlan): MarketplaceCheckResult {
  const result =
    install.ownership === 'snapshot'
      ? checkCompilationSnapshot(install.plan, install.destinationRoot)
      : checkCompilationOutputs(install.plan, install.destinationRoot);

  const collision = detectInstallCollision(install);
  if (!collision) return result;

  // check-install is read-only: report the same collision that would make
  // `install` refuse, as a diagnostic rather than a thrown error. Anchor on
  // the canonical output (SKILL.md for a directory-layout artifact) rather
  // than outputs[0], which is only correct by the accident that outputs sort
  // alphabetically and SKILL.md happens to sort first.
  const anchor = canonicalOutput(install.artifact, install.plan.outputs) ?? install.plan.outputs[0];
  const publicationId = anchor?.provenance.publicationId ?? 'install';
  const collisionIssue: MarketplaceCheckIssue = {
    code: 'cross-target-install-collision',
    publicationId,
    path: anchor?.destination ?? '.',
    message: collisionMessage(install, collision.collidingTarget, collision.differs),
  };
  return {
    ...result,
    issues: [...result.issues, collisionIssue].toSorted(
      (left, right) =>
        compareStrings(left.path, right.path) || compareStrings(left.code, right.code),
    ),
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
