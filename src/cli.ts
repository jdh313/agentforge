#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import matter from 'gray-matter';
import { render } from './render.ts';
import { CanonicalFrontmatter } from './schema.ts';
import { allTargets } from './targets/index.ts';
import { type RenderResult, TARGET_NAMES, type TargetName } from './types.ts';

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

program
  .command('render <source-dir>')
  .description('Render a skill source directory to one or all targets')
  .option('-t, --target <name>', 'target name (claude, opencode, codex)')
  .option('-o, --out <dir>', 'output directory (used with --target)')
  .option('--all-targets', 'render to all registered targets')
  .option('--out-base <dir>', 'base output dir; per-target output goes to <out-base>/<target>')
  .action(async (sourceDir: string, opts: Record<string, string | boolean | undefined>) => {
    const src = resolve(sourceDir);
    if (!existsSync(src)) {
      console.error(`source dir not found: ${src}`);
      process.exit(1);
    }

    if (opts.allTargets) {
      const outBase = typeof opts.outBase === 'string' ? opts.outBase : undefined;
      if (!outBase) {
        console.error('--all-targets requires --out-base <dir>');
        process.exit(1);
      }
      for (const adapter of allTargets()) {
        const outDir = join(resolve(outBase), adapter.name);
        const result = await render({ sourceDir: src, target: adapter.name, outDir });
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
    const result = await render({ sourceDir: src, target, outDir: resolve(out) });
    console.log(formatResult(target, result));
  });

program
  .command('validate <source-dir>')
  .description('Validate the canonical SKILL.md against the schema')
  .action((sourceDir: string) => {
    const src = resolve(sourceDir);
    const skillFile = join(src, 'SKILL.md');
    if (!existsSync(skillFile)) {
      console.error(`SKILL.md not found at ${skillFile}`);
      process.exit(1);
    }
    const raw = readFileSync(skillFile, 'utf-8');
    const parsed = matter(raw);
    const result = CanonicalFrontmatter.safeParse(parsed.data);
    if (!result.success) {
      console.error(`invalid frontmatter in ${skillFile}:`);
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      process.exit(1);
    }
    console.log(`ok: ${skillFile}`);
  });

program
  .command('list-targets')
  .description('List registered render targets and their output base dirs')
  .action(() => {
    for (const adapter of allTargets()) {
      console.log(`${adapter.name.padEnd(10)} ${adapter.outputBaseDir()}`);
    }
  });

program.parseAsync(process.argv);
