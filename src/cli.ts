#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { Command } from 'commander';
import matter from 'gray-matter';
import pkg from '../package.json' with { type: 'json' };
import { checkCompilationSnapshot, checkMarketplace, type MarketplaceCheckIssue } from './check.ts';
import {
  buildCodexAgentBundleInstallPlan,
  buildCodexAgentBundleRemovePlan,
  buildCodexAgentBundleUpdatePlan,
  type CodexScopeAnchors,
  checkCodexAgentBundleInstallPlan,
  compileCodexAgentBundle,
  describeCodexScopeAnchors,
  materializeCodexAgentBundleInstallPlan,
  materializeCodexAgentBundleLifecyclePlan,
  previewCodexAgentBundleLifecyclePlan,
  repairCodexAgentBundleLifecyclePlan,
  validateCodexAgentBundleInstallPlan,
} from './codex-agent-bundle.ts';
import {
  enumerateInstalledCodexPlugins,
  syncInstalledCodexAgents,
  userCodexHome,
} from './codex-installed-plugins.ts';
import { type CompilationPlan, compileMarketplace, type RootAnchoredOutput } from './compiler.ts';
import {
  type LoadedMarketplace,
  loadMarketplaceDefinition,
  loadStandalonePackageDefinition,
} from './definitions.ts';
import {
  buildInstallPlan,
  checkInstallPlan,
  materializeInstallPlan,
  refusedInstallResult,
} from './install.ts';
import { materializeCompilation } from './materializer.ts';
import { compilePackage, materializePackage } from './package-compiler.ts';
import { render } from './render.ts';
import { buildCheckReport, formatFromPath, type ReportFormat, renderReport } from './report.ts';
import { rootDisplayPath } from './root-manifest.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { ProjectionRefusedError } from './target-adapter.ts';
import { allTargets, getTarget } from './targets/index.ts';
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  INSTALL_SCOPES,
  type InstallScope,
  type RenderResult,
  TARGET_NAMES,
  type TargetName,
} from './types.ts';

const program = new Command();

program
  .name('agentforge')
  .description('Render canonical AI agent artifacts for multiple harnesses')
  // semantic-release bumps package.json; the binary reports the same number.
  .version(pkg.version);

const artifactCommands = program
  .command('artifact')
  .description(
    'Render, validate, and install canonical leaf artifacts (skills, agents, output styles)',
  );
const marketplaceCommands = program
  .command('marketplace')
  .description('Compile and check marketplaces');
const packageCommands = program
  .command('package')
  .description('Compile and check standalone native packages');
const codexCommands = program.command('codex').description('Manage Codex integrations');
const codexBundleCommands = codexCommands
  .command('agents')
  .description('Compile and manage native Codex agents from compiled bundles');
const codexBundleRepairCommands = codexBundleCommands
  .command('repair')
  .description('Resume interrupted bundle lifecycle operations');
const targetCommands = program.command('targets').description('Inspect registered targets');

const formatResult = (target: TargetName, result: RenderResult): string => {
  const lines = [`[${target}] wrote ${result.outputPath}`];
  if (result.resourcesCopied.length > 0) {
    lines.push(`  resources: ${result.resourcesCopied.join(', ')}`);
  }
  for (const w of result.warnings) {
    lines.push(`  warn: ${w.detail}`);
  }
  return lines.join('\n');
};

const isTargetName = (s: string): s is TargetName =>
  (TARGET_NAMES as readonly string[]).includes(s);

const isArtifactType = (s: string): s is ArtifactType =>
  (ARTIFACT_TYPES as readonly string[]).includes(s);

const isInstallScope = (s: string): s is InstallScope =>
  (INSTALL_SCOPES as readonly string[]).includes(s);

const detectArtifact = (sourceDir: string): ArtifactType => {
  const present = ARTIFACT_TYPES.filter((a) =>
    existsSync(join(sourceDir, ARTIFACT_DEFS[a].canonicalFilename)),
  );
  if (present.length === 0) {
    const expected = ARTIFACT_TYPES.map((a) => ARTIFACT_DEFS[a].canonicalFilename).join(' or ');
    throw new Error(`no canonical file in ${sourceDir} (expected ${expected})`);
  }
  if (present.length > 1) {
    throw new Error(
      `multiple canonical files in ${sourceDir}: ${present.join(', ')} — pass --artifact to disambiguate`,
    );
  }
  return present[0];
};

const resolveArtifact = (sourceDir: string, flag: string | undefined): ArtifactType => {
  if (flag) {
    if (!isArtifactType(flag)) {
      console.error(`unknown artifact: ${flag}. valid: ${ARTIFACT_TYPES.join(', ')}`);
      process.exit(1);
    }
    return flag;
  }
  return detectArtifact(sourceDir);
};

const collect = (value: string, previous: string[]): string[] => [...previous, value];

const compareStrings = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const selectPublications = (
  loaded: LoadedMarketplace,
  requested: readonly string[],
): LoadedMarketplace => {
  if (requested.length === 0) return loaded;

  const duplicate = requested.find((id, index) => requested.indexOf(id) !== index);
  if (duplicate) throw new Error(`duplicate publication: ${duplicate}`);

  const available = new Set(loaded.definition.publications.map(({ id }) => id));
  const unknown = requested.find((id) => !available.has(id));
  if (unknown) throw new Error(`unknown publication: ${unknown}`);

  const selected = new Set(requested);
  return {
    ...loaded,
    definition: {
      ...loaded.definition,
      publications: loaded.definition.publications.filter(({ id }) => selected.has(id)),
    },
  };
};

const formatCompilation = (plan: CompilationPlan): string => {
  const outputCounts = new Map<string, number>();
  for (const output of plan.outputs) {
    const publication = output.provenance.publicationId;
    outputCounts.set(publication, (outputCounts.get(publication) ?? 0) + 1);
  }
  for (const output of plan.rootOutputs) {
    const publication = output.provenance.publicationId;
    outputCounts.set(publication, (outputCounts.get(publication) ?? 0) + 1);
  }

  const lines = [...outputCounts]
    .toSorted(([left], [right]) => compareStrings(left, right))
    .map(([publication, count]) => `[${publication}] wrote ${count} files`);
  for (const output of plan.rootOutputs) {
    lines.push(
      `[${output.provenance.publicationId}] root manifest ${rootDisplayPath(output.destination)}`,
    );
  }
  lines.push(...formatCompilationDiagnostics(plan));
  return lines.join('\n');
};

const formatCompilationDiagnostics = (plan: CompilationPlan): string[] => {
  const lines: string[] = [];
  for (const diagnostic of plan.diagnostics) {
    const packageDetail = diagnostic.provenance.packageId
      ? `/${diagnostic.provenance.packageId}`
      : '';
    lines.push(
      `${diagnostic.severity} [${diagnostic.provenance.publicationId}${packageDetail}] ${diagnostic.code}: ${diagnostic.message}`,
    );
  }
  return lines;
};

const compileSelectedMarketplace = (
  loaded: LoadedMarketplace,
  outputRoot: string,
): CompilationPlan => {
  const outputs: CompilationPlan['outputs'][number][] = [];
  const diagnostics: CompilationPlan['diagnostics'][number][] = [];
  const rootOutputs: RootAnchoredOutput[] = [];

  for (const publication of loaded.definition.publications.toSorted((left, right) =>
    compareStrings(left.id, right.id),
  )) {
    const publicationMarketplace: LoadedMarketplace = {
      ...loaded,
      definition: { ...loaded.definition, publications: [publication] },
    };
    const plan = compileMarketplace(publicationMarketplace, allTargets(), { outputRoot });
    // Root outputs are already anchored at the marketplace root, so they are
    // carried across untouched while nested destinations gain their prefix.
    rootOutputs.push(...plan.rootOutputs);
    outputs.push(
      ...plan.outputs.map((output) => ({
        ...output,
        destination: `${publication.id}/${output.destination}`,
      })),
    );
    diagnostics.push(...plan.diagnostics);
  }

  return {
    marketplaceId: loaded.definition.id,
    outputs,
    diagnostics,
    rootOutputs,
    redactions: loaded.definition.redactions ?? [],
  };
};

const compileStandalonePackage = async (path: string, target: string): Promise<CompilationPlan> => {
  if (!isTargetName(target)) {
    throw new Error(`unknown target: ${target}. valid: ${TARGET_NAMES.join(', ')}`);
  }
  const adapter = getTarget(target);
  const loaded = await loadStandalonePackageDefinition(resolve(path), target);
  return compilePackage(loaded, adapter);
};

packageCommands
  .command('compile <package>')
  .description('Compile a package definition into a complete owned output snapshot')
  .requiredOption('-t, --target <name>', 'target with standalone package compilation support')
  .requiredOption('-o, --out <dir>', 'owned package output directory (must not overlap source)')
  .action(async (path: string, opts: { target: string; out: string }) => {
    try {
      const plan = await compileStandalonePackage(path, opts.target);
      materializePackage(plan, resolve(opts.out));
      console.log(formatCompilation(plan));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

packageCommands
  .command('check <package>')
  .description(
    'Check a compiled package and its native resources without writing or executing code',
  )
  .requiredOption('-t, --target <name>', 'target with standalone package compilation support')
  .requiredOption('-o, --out <dir>', 'compiled package output directory')
  .option('--json', 'emit the result as a JSON document on stdout instead of human lines')
  .action(async (path: string, opts: { target: string; out: string; json?: boolean }) => {
    try {
      const plan = await compileStandalonePackage(path, opts.target);
      const outputRoot = resolve(opts.out);
      const result = checkCompilationSnapshot(plan, outputRoot);
      if (opts.json) {
        console.log(JSON.stringify(buildCheckReport(plan, result), null, 2));
      } else {
        console.log(
          `${result.issues.length === 0 ? 'ok' : 'failed'}: ${result.filesChecked.length} managed files at ${outputRoot}`,
        );
        for (const line of formatCompilationDiagnostics(plan)) console.log(line);
        for (const issue of result.issues) console.error(formatCheckIssue(issue));
      }
      if (result.issues.length > 0) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

marketplaceCommands
  .command('compile <marketplace>')
  .description('Compile a marketplace definition into a complete output directory')
  .requiredOption('-o, --out <dir>', 'output directory')
  .option(
    '-p, --publication <id>',
    'publication to compile; repeat to select more than one',
    collect,
    [],
  )
  .option(
    '--report <path>',
    'write a compilation report; format inferred from the .json or .md extension',
  )
  .action(
    async (marketplace: string, opts: { out: string; publication: string[]; report?: string }) => {
      try {
        // Resolved before compiling: an unusable path should fail before any
        // output is materialized, not after.
        const report = opts.report === undefined ? undefined : reportTarget(opts.report);
        const loaded = await loadMarketplaceDefinition(resolve(marketplace));
        const selected = selectPublications(loaded, opts.publication);
        const plan = compileSelectedMarketplace(selected, resolve(opts.out));
        materializeCompilation(plan, resolve(opts.out));
        if (report) {
          // Written through its own resolved path rather than under `--out`,
          // so the report is never an output and never ships to an installer.
          mkdirSync(dirname(report.path), { recursive: true });
          writeFileSync(report.path, renderReport(plan, report.format));
          console.log(`[report] wrote ${report.path}`);
        }
        console.log(formatCompilation(plan));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    },
  );

// An unrecognized extension is an error rather than a default. Guessing which
// format was meant is how a CI job ends up parsing markdown as JSON.
const reportTarget = (path: string): { path: string; format: ReportFormat } => {
  const format = formatFromPath(path);
  if (!format) {
    throw new Error(`unsupported report format for ${path}; use a .json or .md path`);
  }
  return { path: resolve(path), format };
};

marketplaceCommands
  .command('check <marketplace>')
  .description('Validate a compiled marketplace and report output drift without writing')
  .requiredOption('-o, --out <dir>', 'compiled output directory')
  .option(
    '-p, --publication <id>',
    'publication to check; repeat to select more than one',
    collect,
    [],
  )
  .option(
    '--claude-native',
    'cross-check selected Claude publications with claude plugin validate --strict',
  )
  .option('--json', 'emit the result as a JSON document on stdout instead of human lines')
  .action(
    async (
      marketplace: string,
      opts: { out: string; publication: string[]; claudeNative?: boolean; json?: boolean },
    ) => {
      try {
        const loaded = await loadMarketplaceDefinition(resolve(marketplace));
        const selected = selectPublications(loaded, opts.publication);
        const outputRoot = resolve(opts.out);
        const plan = compileSelectedMarketplace(selected, outputRoot);
        const result = checkMarketplace(plan, outputRoot);

        // `--json` owns stdout entirely: a consumer parses the whole stream, so
        // one stray human line makes the document unparseable. The native
        // cross-check below sends its stdout to stderr in JSON mode so its
        // diagnostics remain visible without contaminating the document.
        if (opts.json) {
          console.log(JSON.stringify(buildCheckReport(plan, result), null, 2));
        } else {
          for (const publication of selected.definition.publications.toSorted((left, right) =>
            compareStrings(left.id, right.id),
          )) {
            const count =
              result.filesChecked.filter((path) => path.startsWith(`${publication.id}/`)).length +
              result.rootFilesChecked.filter(
                ({ publicationId }) => publicationId === publication.id,
              ).length;
            const status = result.issues.some(
              ({ publicationId }) => publicationId === publication.id,
            )
              ? 'failed'
              : 'ok';
            console.log(`[${publication.id}] ${status}: ${count} managed files`);
          }
          for (const line of formatCompilationDiagnostics(plan)) console.log(line);
          for (const issue of result.issues) console.error(formatCheckIssue(issue));
        }

        let failed = result.issues.length > 0;
        if (opts.claudeNative) {
          for (const publication of selected.definition.publications.filter(
            ({ target }) => target === 'claude',
          )) {
            // A root manifest is a second installable marketplace root, so it
            // gets its own pass: validating the nested root says nothing about
            // the rewritten sources in the root copy.
            const roots = [
              join(outputRoot, publication.id),
              ...(publication['root-manifest'] ? [dirname(loaded.path)] : []),
            ];
            for (const root of roots) {
              const native = Bun.spawnSync({
                cmd: ['claude', 'plugin', 'validate', '--strict', root],
                stdout: 'pipe',
                stderr: 'pipe',
              });
              if (native.stdout.length > 0) {
                (opts.json ? process.stderr : process.stdout).write(native.stdout);
              }
              if (native.stderr.length > 0) process.stderr.write(native.stderr);
              if (native.exitCode !== 0) {
                failed = true;
                // Which root failed is the whole point of running two passes:
                // an unqualified line leaves the reader unable to tell the
                // nested copy's failure from the root copy's.
                console.error(
                  `error [${publication.id}] claude-native-validation: claude plugin validate --strict ${root} exited ${native.exitCode}`,
                );
              }
            }
          }
        }
        if (failed) process.exitCode = 1;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    },
  );

const formatCheckIssue = (issue: MarketplaceCheckIssue): string => {
  const packageDetail = issue.packageId ? `/${issue.packageId}` : '';
  return `error [${issue.publicationId}${packageDetail}] ${issue.code}: ${issue.path}: ${issue.message}`;
};

interface InstallCommandOptions {
  target: string;
  scope: string;
  artifact?: string;
  projectRoot?: string;
  pluginRoot?: string;
}

const resolveInstallPlan = (sourceDir: string, opts: InstallCommandOptions) => {
  if (!isTargetName(opts.target)) {
    throw new Error(`unknown target: ${opts.target}. valid: ${TARGET_NAMES.join(', ')}`);
  }
  if (!isInstallScope(opts.scope)) {
    throw new Error(`unknown install scope: ${opts.scope}. valid: ${INSTALL_SCOPES.join(', ')}`);
  }
  const source = resolve(sourceDir);
  const artifact = resolveArtifact(source, opts.artifact);
  return buildInstallPlan({
    sourceDir: source,
    target: opts.target,
    artifact,
    scope: opts.scope,
    projectRoot: resolve(opts.projectRoot ?? workingProjectRoot(process.cwd())),
    ...(process.env.CODEX_HOME === undefined ? {} : { codexHomeDirectory: process.env.CODEX_HOME }),
    // Pi's getAgentDir treats an empty value as unset, so this does too.
    ...(process.env.PI_CODING_AGENT_DIR
      ? { piAgentDirectory: process.env.PI_CODING_AGENT_DIR }
      : {}),
    ...(opts.pluginRoot === undefined ? {} : { pluginRoot: resolve(opts.pluginRoot) }),
  });
};

const addInstallOptions = (command: Command): Command =>
  command
    .requiredOption('-t, --target <name>', `target name (${TARGET_NAMES.join(', ')})`)
    .requiredOption('-s, --scope <scope>', `install scope (${INSTALL_SCOPES.join(', ')})`)
    .option('-a, --artifact <name>', `artifact type (${ARTIFACT_TYPES.join(', ')})`)
    .option('--project-root <dir>', 'project root used for project-scope installation')
    .option('--plugin-root <dir>', 'package root used for plugin-scope installation');

interface CodexBundleInstallOptions {
  scope: string;
  projectRoot?: string;
  dryRun?: boolean;
}

const resolveCodexBundleInstall = (bundleRoot: string, opts: CodexBundleInstallOptions) => {
  if (opts.scope !== 'user' && opts.scope !== 'project') {
    throw new Error('Codex agent bundles support user or project installation scope');
  }
  return buildCodexAgentBundleInstallPlan({
    bundleRoot: resolve(bundleRoot),
    scope: opts.scope,
    projectRoot: resolve(opts.projectRoot ?? workingProjectRoot(process.cwd())),
    ...(process.env.CODEX_HOME === undefined ? {} : { codexHomeDirectory: process.env.CODEX_HOME }),
  });
};

const codexBundleScopeOptions = (opts: CodexBundleInstallOptions) => {
  if (opts.scope !== 'user' && opts.scope !== 'project') {
    throw new Error('Codex agent bundles support user or project installation scope');
  }
  return {
    scope: opts.scope as 'user' | 'project',
    projectRoot: resolve(opts.projectRoot ?? workingProjectRoot(process.cwd())),
    ...(process.env.CODEX_HOME === undefined ? {} : { codexHomeDirectory: process.env.CODEX_HOME }),
  };
};

const printCodexLifecyclePreview = (
  preview: ReturnType<typeof previewCodexAgentBundleLifecyclePlan>,
  anchors: CodexScopeAnchors,
) => {
  console.log(`${preview.status}: ${preview.operation}`);
  for (const line of describeCodexScopeAnchors(anchors)) console.log(line);
  for (const action of preview.actions) {
    console.log(`${action.kind}: ${action.path}: ${action.reason}`);
  }
  for (const issue of preview.issues) console.error(`issue: ${issue.path}: ${issue.message}`);
  if (preview.status !== 'ready') process.exitCode = 1;
};

codexBundleCommands
  .command('compile <source-dir>')
  .description('Compile one canonical agent into a legacy-compatible Codex agent bundle')
  .requiredOption('--package-id <id>', 'stable package identity used to namespace the role')
  .requiredOption('-o, --out <dir>', 'bundle output directory')
  .action((sourceDir: string, opts: { packageId: string; out: string }) => {
    try {
      const bundle = compileCodexAgentBundle({
        sourceDir: resolve(sourceDir),
        packageId: opts.packageId,
        outputRoot: resolve(opts.out),
      });
      console.log(`compiled ${bundle.agentName} at ${bundle.indexPath}`);
      for (const line of formatCompilationDiagnostics(bundle.plan)) console.log(line);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleCommands
  .command('install <bundle-dir>')
  .description('Install one validated compiled Codex agent bundle')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .option('--dry-run', 'validate the bundle and print its destinations without writing')
  .action((bundleDir: string, opts: CodexBundleInstallOptions) => {
    try {
      const install = resolveCodexBundleInstall(bundleDir, opts);
      if (opts.dryRun) {
        validateCodexAgentBundleInstallPlan(install);
        console.log(`ready: ${install.agentNames.join(', ')}`);
        for (const definition of install.definitionPaths) {
          console.log(`definition: ${join(install.destinationRoot, definition)}`);
        }
        console.log(`receipt: ${join(install.destinationRoot, install.receiptPath)}`);
        for (const line of describeCodexScopeAnchors(install.anchors)) console.log(line);
        return;
      }
      materializeCodexAgentBundleInstallPlan(install);
      console.log(`installed ${install.agentNames.join(', ')} at ${install.destinationRoot}`);
      for (const line of describeCodexScopeAnchors(install.anchors)) console.log(line);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleCommands
  .command('check <bundle-dir>')
  .description('Check one compiled Codex agent bundle installation without writing')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .action((bundleDir: string, opts: CodexBundleInstallOptions) => {
    try {
      const install = resolveCodexBundleInstall(bundleDir, opts);
      const result = checkCodexAgentBundleInstallPlan(install);
      console.log(
        `${result.status}: ${result.filesChecked.length} managed paths at ${result.destinationRoot}`,
      );
      for (const line of describeCodexScopeAnchors(install.anchors)) console.log(line);
      for (const issue of result.issues) {
        console.error(`${issue.status}: ${issue.path}: ${issue.message}`);
      }
      if (result.status !== 'current') process.exitCode = 1;
    } catch (error) {
      console.error(
        `unsupported: ${resolve(bundleDir)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  });

codexBundleCommands
  .command('update <bundle-dir>')
  .description('Update owned Codex agents from a compiled bundle')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .option('--dry-run', 'preview owned-agent changes without writing')
  .action((bundleDir: string, opts: CodexBundleInstallOptions) => {
    try {
      const plan = buildCodexAgentBundleUpdatePlan({
        bundleRoot: resolve(bundleDir),
        ...codexBundleScopeOptions(opts),
      });
      if (opts.dryRun) {
        printCodexLifecyclePreview(previewCodexAgentBundleLifecyclePlan(plan), plan.anchors);
        return;
      }
      materializeCodexAgentBundleLifecyclePlan(plan);
      console.log(`updated Codex agents at ${plan.destinationRoot}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleCommands
  .command('remove <package-id>')
  .description('Remove owned Codex agents using only the installed receipt')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .option('--dry-run', 'preview removal using the installed receipt without writing')
  .action((packageId: string, opts: CodexBundleInstallOptions) => {
    try {
      const plan = buildCodexAgentBundleRemovePlan({
        packageId,
        ...codexBundleScopeOptions(opts),
      });
      if (opts.dryRun) {
        printCodexLifecyclePreview(previewCodexAgentBundleLifecyclePlan(plan), plan.anchors);
        return;
      }
      materializeCodexAgentBundleLifecyclePlan(plan);
      console.log(`removed owned Codex agents for ${packageId} at ${plan.destinationRoot}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleRepairCommands
  .command('remove <package-id>')
  .description('Resume interrupted owned-agent removal after inspection')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .action((packageId: string, opts: CodexBundleInstallOptions) => {
    try {
      const plan = buildCodexAgentBundleRemovePlan({
        packageId,
        ...codexBundleScopeOptions(opts),
      });
      repairCodexAgentBundleLifecyclePlan(plan);
      console.log(`repaired Codex agent ownership for ${packageId} at ${plan.destinationRoot}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleRepairCommands
  .command('update <bundle-dir>')
  .description('Resume an interrupted owned-agent update after inspection')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .action((bundleDir: string, opts: CodexBundleInstallOptions) => {
    try {
      const plan = buildCodexAgentBundleUpdatePlan({
        bundleRoot: resolve(bundleDir),
        ...codexBundleScopeOptions(opts),
      });
      repairCodexAgentBundleLifecyclePlan(plan);
      console.log(`repaired Codex agent update at ${plan.destinationRoot}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

codexBundleCommands
  .command('sync')
  .description('Install or update Codex agent bundles shipped by installed, enabled Codex plugins')
  .requiredOption('-s, --scope <scope>', 'installation scope (user, project)')
  .option('--project-root <dir>', 'project root used for project-scope installation')
  .option('--dry-run', 'print the planned action per plugin without writing')
  .action((opts: CodexBundleInstallOptions & { dryRun?: boolean }) => {
    try {
      const { scope, projectRoot, codexHomeDirectory } = codexBundleScopeOptions(opts);
      // Plugins are installed per user, so discovery reads the user's Codex home
      // even when the agents are being installed at project scope.
      const enumeration = enumerateInstalledCodexPlugins(userCodexHome());
      const report = syncInstalledCodexAgents({
        enumeration,
        scope: {
          scope,
          projectRoot,
          ...(codexHomeDirectory === undefined ? {} : { codexHomeDirectory }),
        },
        dryRun: opts.dryRun === true,
      });
      for (const line of report.anchorLines) console.log(line);
      for (const line of report.lines) console.log(line.text);
      console.log(report.summary);
      if (!report.ok) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

const workingProjectRoot = (start: string): string => {
  const fallback = resolve(start);
  let current = fallback;
  while (current !== parse(current).root) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, '.jj'))) return current;
    current = dirname(current);
  }
  return fallback;
};

addInstallOptions(
  artifactCommands.command('install <source-dir>').description('Install one canonical artifact'),
).action((sourceDir: string, opts: InstallCommandOptions) => {
  try {
    const install = resolveInstallPlan(sourceDir, opts);
    materializeInstallPlan(install);
    console.log(`installed ${install.plan.outputs.length} files at ${install.destinationRoot}`);
    for (const line of formatCompilationDiagnostics(install.plan)) console.log(line);
  } catch (error) {
    const hint =
      error instanceof ProjectionRefusedError
        ? ' Nothing was written: an agent previously installed at the destination is left in place and is still active.'
        : '';
    console.error(`${error instanceof Error ? error.message : String(error)}${hint}`);
    process.exitCode = 1;
  }
});

addInstallOptions(
  artifactCommands
    .command('check-install <source-dir>')
    .description('Check one installed canonical artifact without writing'),
).action((sourceDir: string, opts: InstallCommandOptions) => {
  try {
    let install: ReturnType<typeof resolveInstallPlan>;
    try {
      install = resolveInstallPlan(sourceDir, opts);
    } catch (error) {
      // A target declining this source is a non-current state, not a crash.
      if (!(error instanceof ProjectionRefusedError)) throw error;
      console.log(`failed: ${opts.target} refuses to project this source`);
      for (const issue of refusedInstallResult(error).issues) {
        console.error(formatCheckIssue(issue));
      }
      process.exitCode = 1;
      return;
    }
    const result = checkInstallPlan(install);
    const status = result.issues.length === 0 ? 'ok' : 'failed';
    console.log(
      `${status}: ${result.filesChecked.length} managed files at ${install.destinationRoot}`,
    );
    for (const line of formatCompilationDiagnostics(install.plan)) console.log(line);
    for (const issue of result.issues) console.error(formatCheckIssue(issue));
    if (result.issues.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

artifactCommands
  .command('render <source-dir>')
  .description('Render a canonical artifact source directory to one or all targets')
  .option('-t, --target <name>', `target name (${TARGET_NAMES.join(', ')})`)
  .option('-o, --out <dir>', 'output directory (used with --target)')
  .option('--all-targets', 'render to all registered targets')
  .option('--out-base <dir>', 'base output dir; per-target output goes to <out-base>/<target>')
  .option(
    '-a, --artifact <name>',
    `artifact type (${ARTIFACT_TYPES.join(', ')}); inferred if omitted`,
  )
  .action(async (sourceDir: string, opts: Record<string, string | boolean | undefined>) => {
    if (opts.allTargets && (opts.target !== undefined || opts.out !== undefined)) {
      console.error('--all-targets cannot be combined with --target or --out');
      process.exit(1);
    }
    if (!opts.allTargets && opts.outBase !== undefined) {
      console.error('--out-base requires --all-targets');
      process.exit(1);
    }
    const src = resolve(sourceDir);
    if (!existsSync(src)) {
      console.error(`source dir not found: ${src}`);
      process.exit(1);
    }

    const artifactFlag = typeof opts.artifact === 'string' ? opts.artifact : undefined;
    let artifact: ArtifactType;
    try {
      artifact = resolveArtifact(src, artifactFlag);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (opts.allTargets) {
      const outBase = typeof opts.outBase === 'string' ? opts.outBase : undefined;
      if (!outBase) {
        console.error('--all-targets requires --out-base <dir>');
        process.exit(1);
      }
      for (const adapter of allTargets()) {
        if (!adapter.artifacts[artifact]) {
          console.log(`[${adapter.name}] skip: artifact ${artifact} not supported`);
          continue;
        }
        const outDir = join(resolve(outBase), adapter.name);
        try {
          const result = await render({ sourceDir: src, target: adapter.name, outDir, artifact });
          console.log(formatResult(adapter.name, result));
        } catch (error) {
          // A refusal is the target declining this source (ndr:jybfry), not a
          // malformed one: report it like an unsupported pair and continue.
          if (!(error instanceof ProjectionRefusedError)) throw error;
          console.log(`[${adapter.name}] skip: ${error.message}`);
        }
      }
      return;
    }

    const target = typeof opts.target === 'string' ? opts.target : undefined;
    const out = typeof opts.out === 'string' ? opts.out : undefined;
    if (!target || !out) {
      console.error(
        'render requires either --all-targets --out-base <dir>, or --target <name> --out <dir>',
      );
      process.exit(1);
    }
    if (!isTargetName(target)) {
      console.error(`unknown target: ${target}. valid: ${TARGET_NAMES.join(', ')}`);
      process.exit(1);
    }
    const result = await render({ sourceDir: src, target, outDir: resolve(out), artifact });
    console.log(formatResult(target, result));
  });

artifactCommands
  .command('validate <source-dir>')
  .description('Validate the canonical artifact file against its schema')
  .option(
    '-a, --artifact <name>',
    `artifact type (${ARTIFACT_TYPES.join(', ')}); inferred if omitted`,
  )
  .action((sourceDir: string, opts: Record<string, string | undefined>) => {
    const src = resolve(sourceDir);
    let artifact: ArtifactType;
    try {
      artifact = resolveArtifact(src, opts.artifact);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    const def = ARTIFACT_DEFS[artifact];
    const canonicalFile = join(src, def.canonicalFilename);
    const raw = readFileSync(canonicalFile, 'utf-8');
    const parsed = matter(raw);
    const result = def.canonicalSchema.safeParse(parsed.data);
    if (!result.success) {
      console.error(`invalid frontmatter in ${canonicalFile}:`);
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      process.exit(1);
    }
    console.log(`ok: ${canonicalFile}`);
  });

targetCommands
  .command('list')
  .description('List registered targets, artifacts, and install scopes')
  .action(() => {
    for (const adapter of allTargets()) {
      const entries = Object.entries(adapter.artifacts);
      for (const [artifact, cfg] of entries) {
        if (!cfg) continue;
        const scopes = Object.keys(cfg.installLocations);
        console.log(
          `${adapter.name.padEnd(12)} ${artifact.padEnd(14)} install: ${scopes.length === 0 ? 'none' : scopes.join(', ')}`,
        );
      }
    }
  });

program.parseAsync(process.argv);
