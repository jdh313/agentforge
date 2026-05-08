#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import matter from 'gray-matter';
import { render } from './render.ts';
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
