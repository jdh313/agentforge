#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import matter from 'gray-matter';
import { checkMarketplace, type MarketplaceCheckIssue } from './check.ts';
import { type CompilationPlan, compileMarketplace, type RootAnchoredOutput } from './compiler.ts';
import { type LoadedMarketplace, loadMarketplaceDefinition } from './definitions.ts';
import { claudeMarketplaceAdapter, codexMarketplaceAdapter } from './marketplace-adapters.ts';
import { materializeCompilation } from './materializer.ts';
import { render } from './render.ts';
import { formatFromPath, type ReportFormat, renderReport } from './report.ts';
import { rootDisplayPath } from './root-manifest.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { allTargets } from './targets/index.ts';
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  type RenderResult,
  TARGET_NAMES,
  type TargetName,
} from './types.ts';

const program = new Command();

program
  .name('agentforge')
  .description('Render canonical AI agent artifacts for multiple harnesses')
  .version('0.0.1');

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
    const plan = compileMarketplace(
      publicationMarketplace,
      [claudeMarketplaceAdapter, codexMarketplaceAdapter],
      { outputRoot },
    );
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

  return { marketplaceId: loaded.definition.id, outputs, diagnostics, rootOutputs };
};

program
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

program
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
  .action(
    async (
      marketplace: string,
      opts: { out: string; publication: string[]; claudeNative?: boolean },
    ) => {
      try {
        const loaded = await loadMarketplaceDefinition(resolve(marketplace));
        const selected = selectPublications(loaded, opts.publication);
        const outputRoot = resolve(opts.out);
        const plan = compileSelectedMarketplace(selected, outputRoot);
        const result = checkMarketplace(plan, outputRoot);

        for (const publication of selected.definition.publications.toSorted((left, right) =>
          compareStrings(left.id, right.id),
        )) {
          const count =
            result.filesChecked.filter((path) => path.startsWith(`${publication.id}/`)).length +
            result.rootFilesChecked.filter(({ publicationId }) => publicationId === publication.id)
              .length;
          const status = result.issues.some(({ publicationId }) => publicationId === publication.id)
            ? 'failed'
            : 'ok';
          console.log(`[${publication.id}] ${status}: ${count} managed files`);
        }
        for (const line of formatCompilationDiagnostics(plan)) console.log(line);
        for (const issue of result.issues) console.error(formatCheckIssue(issue));

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
              if (native.stdout.length > 0) process.stdout.write(native.stdout);
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

program
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
        const result = await render({ sourceDir: src, target: adapter.name, outDir, artifact });
        console.log(formatResult(adapter.name, result));
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

program
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

program
  .command('list-targets')
  .description('List registered render targets and their output base dirs')
  .action(() => {
    for (const adapter of allTargets()) {
      const entries = Object.entries(adapter.artifacts);
      for (const [artifact, cfg] of entries) {
        if (!cfg) continue;
        console.log(`${adapter.name.padEnd(12)} ${artifact.padEnd(14)} ${cfg.outputBaseDir()}`);
      }
    }
  });

program.parseAsync(process.argv);
