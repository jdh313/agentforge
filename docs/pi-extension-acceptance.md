# Pi native-extension package acceptance

## Verdict

Last exercised: **2026-10-12**, Pi **1.1.0**, Bun **1.4.3**, Node **v26.11.1**
on macOS arm64. Other runtime versions and operating systems are not established.

**PASS against installed Pi 1.1.0**, using `bun run acceptance:pi-extensions`.
The executable's exit status is the verdict; missing prerequisites, failed
assertions, missing CLI commands, and timeouts exit nonzero. This is a
**deterministic native-runtime test, not a model evaluation** or a certification
of arbitrary extension behavior.

The contract is [nt12pb](../decisions/nt12pb-compile-native-pi-packages-without-a-fabricated-marketplace.md)
and the scope is [the native-extension plan](pi-native-extension-plan.md).

## Re-run

```sh
bun run acceptance:pi-extensions

# Optional: point at an installed package root containing package.json and dist/index.js.
PI_ACCEPTANCE_RUNTIME_DIR=/path/to/@earendil-works/pi-coding-agent \
  bun run acceptance:pi-extensions
```

Prerequisites: Bun, Node, this checkout's installed development dependencies,
and an installed `@earendil-works/pi-coding-agent` **exactly 1.1.0**, including
its unbundled SDK and normal runtime dependencies. No dependency installation
is performed by the script. It resolves the runtime from the real path of the
`pi` executable, searching ancestor package roots and ordinary `node_modules`,
`lib/node_modules`, and `libexec/lib/node_modules` layouts. Set
`PI_ACCEPTANCE_EXECUTABLE` to select a different executable, or use the explicit
package-root override. Resolution is not restricted to Homebrew paths.

## Isolation and execution policy

- The parent creates a disposable directory and runs a separate Bun worker
  with an **allowlisted environment**. `HOME`, `USERPROFILE`, XDG directories,
  Pi agent/session directories, temp directories, npm config/cache paths,
  consumer project, compiled packages, and consumer copies are disposable.
- Provider credentials, original Pi state, `NODE_OPTIONS`, and user npm settings
  are not forwarded. Personal settings, trust, extensions, and auth files are
  neither read nor modified by the worker. `PATH` is retained to find runtimes.
- Offline mode, disabled version checks/telemetry, and a throwing SDK `fetch`
  prevent automatic/network model activity. The SDK uses an exclusively local
  fake provider with a literal **non-credential** auth placeholder, a made-up
  API, zero cost/usage, and at most two deterministic stream responses. No real
  provider or paid model is called.
- CLI operations are local-path `install`/`remove`, trust-gated `--help`, and
  AgentForge compile/check. No npm/git source, package manager, download, or
  lifecycle-script installation is invoked.
- Extension factories register handlers/tools/commands/flags only; they start
  no timers, sockets, watchers, or child processes. Marker writes happen in
  invoked handlers, not at factory registration. Temporary data is removed in
  `finally`, including after failure; child commands have 90-second timeouts.
- This is isolated **configuration**, not an operating-system sandbox. The
  trusted fixture code and installed runtime still run with the host user's
  permissions. It is not a general runner for untrusted extensions.

## Observed gates

| Gate | Evidence from the executable |
|---|---|
| Runtime pin | Both installed package manifest and isolated CLI `--version` equal 1.1.0. |
| Real compiler | `loadPackageDefinition` → `compilePackage(loaded, getTarget('pi'))` → `materializePackage(plan, out)`, not a hand-written package. |
| Extension-only and mixed compilation | Three fixtures compile; repeated manifest bytes match; extension entry bytes are preserved; all resource arrays are explicit. |
| Pure compilation | No fixture marker exists after compilation/materialization. |
| Real Pi package discovery | `DefaultResourceLoader` reads generated manifests and registers exactly one declared extension, no loader errors. |
| Relative helpers and assets | Loaded handler imports the routed helper and reads the routed asset, recording `asset-loaded`. Helper's default factory deliberately throws if accidentally activated. |
| Directory entry point | A disposable native-source copy routes `pi/entry/index.js` to `entry/index.js` and declares `./entry`. Real compilation preserves the bytes; Pi discovers exactly one extension, registers its tools, and its session-start handler successfully imports the relative helper and reads the asset. |
| Commands and tools | `session.prompt('/af-acceptance')` executes the registered command without entering the fake provider; probe/target tools appear in the actual session tool set. |
| Actual blocked dispatch | Fake provider emits a probe tool call; its real `ExtensionToolContext.executeTool()` dispatches the target through Pi's tool-call pipeline. Guard marker and denial reason are observed; target's execution marker remains absent. |
| Reload | `session.reload()` emits shutdown for the old runtime, discovers a fresh extension runtime, and emits another session-start marker. |
| SDK shutdown cleanup | The SDK host dispatches `session_shutdown` through the public extension runner, then disposes the session. Repeated shutdown dispatch is idempotent in the fixture. |
| User local-path registration | Isolated `pi install <consumer-copy>` changes only disposable agent settings and makes the extension discoverable. |
| Disable/remove | Package settings resource filters with empty arrays suppress activation; real `pi remove` unregisters the path and subsequent discovery finds no extension. |
| Project local-path registration | Isolated `pi install --local --approve` writes disposable project settings. |
| Project trust | SDK denied trust skips extension/skill; approved trust loads both. Real CLI `--no-approve --help` omits the extension flag, while `--approve --help` includes it. |
| Mixed skill discovery | Exactly one projected skill named `af-acceptance-skill` is discovered alongside the extension. |
| Missing dependency | Loading a package that imports `af-acceptance-tiny-dependency` fails visibly and names that missing package. |
| Consumer dependency provisioning | The harness manually writes a tiny dependency into **the disposable consumer copy's** `node_modules`; a subsequent real loader/session succeeds and records its exported value. No host-provided packages are copied or vendored. |
| CLI compile/check | Mandatory `package compile` and read-only `package check` succeed against a fresh output. Missing command support is a failure, not a skipped gate. |

## Boundaries and remaining gaps

- Blocking is verified through **real model-loop dispatch from a deterministic
  fake stream and real nested-tool dispatch**, not by calling a handler in
  isolation. No judgment about model compliance or natural-language safety is
  made. Arbitrary extension guards are not certified by this fixture.
- SDK host-owned final shutdown is tested explicitly. Native reload shutdown
  is exercised automatically by Pi. A terminal UI `/exit`, process signals,
  crash recovery, and cleanup of real processes/timers are **not tested**; the
  fixtures deliberately allocate none. SDK `dispose()` alone must not be
  described as an observed `session_shutdown` event.
- Denied/approved trust overrides are tested; interactive trust prompts,
  `/trust` persistence/inheritance, interactive `pi config`, and autoload/filter
  layering across duplicate user/project identities are not tested.
- Third-party dependency failure/success is a controlled module-resolution
  test, not npm/git installation, lifecycle script, lockfile, peer-version, or
  arbitrary import-graph compatibility acceptance.
- Exact extension files and an exact directory with `index.js` are exercised.
  A separate `index.ts` directory case, prompt/theme activation, package agents,
  marketplace discovery, other Pi versions, and every operating system are not
  claimed by this run.
- Static integrity/refusal/drift/mode/collision/security cases belong to the
  compiler/check unit suite. A passing runtime test does not replace those
  gates or establish an OS security boundary.

Local Pi installation registers a package path, not an immutable copy. The
script uses consumer copies to keep provisioned `node_modules` outside
AgentForge's complete owned output snapshot; rebuilding a compiler output can
prune unmanaged dependencies. AgentForge compile/check does not modify Pi
settings or grant trust. Activation remains an explicit user action.
