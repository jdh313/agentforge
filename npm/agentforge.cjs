#!/usr/bin/env node
// Wrapper entry point for the `@jdh313/agentforge` npm package.
//
// The package itself carries no binary. Each platform's binary ships in its own
// package (`@jdh313/agentforge-<platform>-<arch>`) declared as an
// optionalDependency and guarded by `os`/`cpu`, so a package manager installs
// exactly the one matching the host and skips the rest. This is the shape
// @biomejs/biome uses; the alternative — a postinstall script that downloads
// the right binary — breaks in hardened CI where install scripts are disabled,
// and offline.
//
// The platform package name is computed rather than looked up in a table: the
// release matrix names every asset `agentforge-<platform>-<arch>` using Node's
// own spellings, so a table would be a second copy of that fact that can drift.
const { spawnSync } = require('node:child_process');

const target = `${process.platform}-${process.arch}`;
const packageName = `@jdh313/agentforge-${target}`;

let binary;
try {
  binary = require.resolve(`${packageName}/agentforge`);
} catch {
  // An unsupported host and a broken install look identical from here, so say
  // both: the release page is the answer to the first, reinstalling to the
  // second.
  console.error(
    `agentforge: no binary for ${target}.\n` +
      `Expected the optional dependency ${packageName} to be installed.\n` +
      'If this platform is unsupported, download a binary from\n' +
      'https://github.com/jdh313/agentforge/releases and put it on PATH.',
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
// A signalled child has a null status; reporting 0 there would tell a CI job
// the run succeeded.
if (result.error) {
  console.error(`agentforge: failed to execute ${binary}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
