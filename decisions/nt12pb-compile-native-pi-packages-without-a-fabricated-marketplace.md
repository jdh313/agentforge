---
id: "nt12pb"
title: Compile native Pi packages without a fabricated marketplace
status: current
decision_date: 2026-10-12
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/target-adapter.ts
  - src/package-compiler.ts
  - src/targets/pi-package.ts
  - src/definitions.ts
supersedes: []
superseded_by: []
derived_from: []
informed_by:
  - w3z7h3
  - nes397
  - wvs5an
  - 3772zz
  - 7rmqea
  - t6sykj
  - jmeae1
---

# Compile native Pi packages without a fabricated marketplace

## Decision

Expose standalone package compilation as an optional capability of the existing target adapter and through package compile/check. Pi packages are ordinary package.json directories, not marketplace registries. Reuse CompilationPlan and the staged materializer without synthesizing a native Pi marketplace.

## Commitments

- Reuse targets.pi.native for manifest metadata and payloads for byte-preserved extension code. These are output-producing declarations owned by the package author; no new canonical hook schema or translation is introduced.
- Permit explicit artifacts: [] only with producing payload declarations; the Pi compiler additionally requires loadable declared resources.
- Emit explicit resource lists. Initially accept exact extension files or directories with verified index.ts/index.js, and projected canonical skills. Other package artifacts and prompt/theme activation are unsupported.
- Keep generated manifest identity authoritative and reject supplied package.json replacement. Validate references after payload routing and preserve unknown native fields without guessing semantics.
- Compile/check never import supplied extensions, execute lifecycle scripts, install dependencies, or change Pi settings/trust. Native runtime acceptance is separate and isolated.
- Target-owned document/resource validation belongs on produced output handles; shared code must not enumerate Pi resource policy.
- Keep package outputs complete owned snapshots, refuse source/output overlap, and retain existing containment, symlink, collision, and provenance guarantees.

## Scope

Packaging existing Pi-native extension modules and optional canonical skills. Not hook translation, agent registration, dependency resolution, publishing, or Pi installation lifecycle.

## Revisit if

Pi adds a native marketplace contract, a second target needs standalone package compilation, or broader native resource syntax has runtime-verified discovery semantics.

## Context

Pi 1.1.0 loads extensions and skills from ordinary packages with a package.json
resource manifest. It has no native marketplace registry for AgentForge to emit.
AgentForge already has native metadata, target-scoped payload routing, and a
shared staged materializer, but its collection compiler requires marketplace
publications and its canonical package schema excludes payload-only packages.
Existing Pi leaf agents depend on a separate extension that does not read agents
from packages. Packaging existing Pi code therefore needs a package boundary,
not a hook translation or an expansion of agent registration claims.

## Alternatives

- Attach Pi marketplace capability with an invented registry: rejected because it claims a runtime concept Pi does not implement.
- Treat extension code as a canonical hook artifact: rejected because arbitrary Pi event handlers have no cross-runtime hook schema.
- Execute extensions to validate a build: rejected because compilation/checking must not execute source-controlled behavior.
