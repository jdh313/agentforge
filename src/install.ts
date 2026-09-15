import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildArtifactPlan } from './artifact-plan.ts';
import type { CompilationPlan } from './compiler.ts';
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
  plan: CompilationPlan;
}

/** Build the single-artifact synthetic publication used by install and check-install. */
export function buildInstallPlan(options: BuildInstallPlanOptions): InstallPlan {
  const sourceDir = resolve(options.sourceDir);
  const artifactDef = ARTIFACT_DEFS[options.artifact];
  if (artifactDef.layout !== 'directory') {
    throw new Error(
      `install supports directory artifacts only; ${options.artifact} uses file layout`,
    );
  }

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
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planned.artifactName)) {
    throw new Error(
      `artifact name ${JSON.stringify(planned.artifactName)} is not a portable skill directory name`,
    );
  }
  const destinationRoot = join(
    location({
      homeDirectory: resolve(options.homeDirectory ?? homedir()),
      projectRoot: resolve(options.projectRoot),
      ...(options.pluginRoot === undefined ? {} : { pluginRoot: resolve(options.pluginRoot) }),
    }),
    planned.artifactName,
  );

  return {
    destinationRoot,
    plan: planned.plan,
  };
}
