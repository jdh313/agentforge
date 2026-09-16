import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildArtifactPlan } from './artifact-plan.ts';
import { checkCompilationOutputs, checkCompilationSnapshot } from './check.ts';
import type { CompilationPlan } from './compiler.ts';
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
  destinationRoot: string;
  ownership: 'snapshot' | 'planned-files';
  plan: CompilationPlan;
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
    throw new Error(
      `target ${options.target} does not support ${options.scope}-scope installation for artifact ${options.artifact}`,
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
  const locationRoot = location({
    homeDirectory: resolve(options.homeDirectory ?? homedir()),
    projectRoot: resolve(options.projectRoot),
    ...(options.pluginRoot === undefined ? {} : { pluginRoot: resolve(options.pluginRoot) }),
  });
  const destinationRoot =
    artifactDef.layout === 'directory' ? join(locationRoot, planned.artifactName) : locationRoot;

  return {
    destinationRoot,
    ownership: artifactDef.layout === 'directory' ? 'snapshot' : 'planned-files',
    plan: planned.plan,
  };
}

export function materializeInstallPlan(install: InstallPlan): MaterializationResult {
  return install.ownership === 'snapshot'
    ? materializeCompilation(install.plan, install.destinationRoot)
    : materializeCompilationOutputs(install.plan, install.destinationRoot);
}

export function checkInstallPlan(install: InstallPlan) {
  return install.ownership === 'snapshot'
    ? checkCompilationSnapshot(install.plan, install.destinationRoot)
    : checkCompilationOutputs(install.plan, install.destinationRoot);
}
