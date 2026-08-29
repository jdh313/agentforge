#!/usr/bin/env node
// Publishes the compiled binaries to the GitHub Packages npm registry as one
// wrapper package plus one package per platform.
//
// Ordering is load-bearing: platform packages publish FIRST, wrapper LAST. The
// wrapper's optionalDependencies pin exact platform versions, so a wrapper that
// lands before its platforms is a version consumers can install and cannot run.
// Publishing in this order means a mid-run failure leaves orphan platform
// packages — inert, since nothing references them — rather than a broken entry
// point.
//
// The platform list is derived from the built assets rather than declared here:
// `release.yml`'s matrix names each asset `agentforge-<platform>-<arch>` using
// Node's own `process.platform` / `process.arch` spellings, which is also what
// the wrapper shim computes at runtime. One source, three readers.
import { chmodSync, copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCOPE = '@jdh313';
const REGISTRY = 'https://npm.pkg.github.com';
const REPOSITORY = 'https://github.com/jdh313/agentforge';

const version = process.env.AGENTFORGE_VERSION?.replace(/^v/, '');
if (!version) throw new Error('AGENTFORGE_VERSION is required (e.g. v0.3.0)');

const distDir = resolve(process.argv[2] ?? 'dist');
const stageDir = resolve('npm-stage');
const dryRun = process.env.DRY_RUN === '1';

const assets = readdirSync(distDir)
  .filter((name) => name.startsWith('agentforge-') && !name.endsWith('SHA256SUMS'))
  .sort();
if (assets.length === 0) throw new Error(`no agentforge-* binaries found in ${distDir}`);

const common = {
  version,
  license: 'Apache-2.0',
  author: { name: 'Jacob Hoehler' },
  repository: { type: 'git', url: `git+${REPOSITORY}.git` },
  homepage: REPOSITORY,
  publishConfig: { registry: `${REGISTRY}/` },
};

function publish(directory) {
  const args = dryRun ? ['publish', '--dry-run'] : ['publish'];
  execFileSync('npm', args, { cwd: directory, stdio: 'inherit' });
}

// --- platform packages, first ---
const optionalDependencies = {};
for (const asset of assets) {
  const target = asset.replace(/^agentforge-/, '');
  const [platform, arch] = target.split('-');
  if (!platform || !arch) throw new Error(`cannot derive platform/arch from ${asset}`);

  const name = `${SCOPE}/agentforge-${target}`;
  const directory = join(stageDir, `agentforge-${target}`);
  mkdirSync(directory, { recursive: true });
  copyFileSync(join(distDir, asset), join(directory, 'agentforge'));
  chmodSync(join(directory, 'agentforge'), 0o755);
  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name,
        ...common,
        description: `agentforge binary for ${platform} ${arch}`,
        os: [platform],
        cpu: [arch],
        // No "exports": the wrapper resolves the binary by subpath
        // (`<name>/agentforge`), which an exports map would forbid.
        files: ['agentforge'],
      },
      null,
      2,
    )}\n`,
  );
  optionalDependencies[name] = version;
  console.log(`publishing ${name}@${version}`);
  publish(directory);
}

// --- wrapper, last ---
const wrapperDir = join(stageDir, 'agentforge');
mkdirSync(join(wrapperDir, 'bin'), { recursive: true });
copyFileSync(resolve('npm/agentforge.cjs'), join(wrapperDir, 'bin', 'agentforge.cjs'));
chmodSync(join(wrapperDir, 'bin', 'agentforge.cjs'), 0o755);
copyFileSync(resolve('README.md'), join(wrapperDir, 'README.md'));
writeFileSync(
  join(wrapperDir, 'package.json'),
  `${JSON.stringify(
    {
      name: `${SCOPE}/agentforge`,
      ...common,
      description: 'Render canonical AI agent artifacts for multiple harnesses',
      bin: { agentforge: 'bin/agentforge.cjs' },
      files: ['bin', 'README.md'],
      optionalDependencies,
    },
    null,
    2,
  )}\n`,
);
console.log(`publishing ${SCOPE}/agentforge@${version}`);
publish(wrapperDir);
console.log(`published ${assets.length + 1} packages at ${version}`);
