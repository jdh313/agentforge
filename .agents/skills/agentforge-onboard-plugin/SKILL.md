---
name: agentforge-onboard-plugin
description: Guide an existing Claude, Codex, or dual-runtime plugin into canonical AgentForge PACKAGE.yaml and MARKETPLACE.yaml definitions. Use when inventorying a native plugin, proposing its artifact and payload declarations, reviewing cross-target compatibility, migrating it into an AgentForge marketplace, or diagnosing why a package cannot yet be enrolled. Preview definitions and compatibility dispositions before changing plugin or marketplace sources.
---

# AgentForge Onboard Plugin

Onboard one real plugin through an inventory-and-review workflow. Treat file discovery as
mechanical evidence and canonical intent as a decision that must remain visible.

## Inputs

Identify:

- the source plugin directory;
- the AgentForge checkout containing this skill;
- the canonical marketplace root, when one already exists;
- the requested targets, or the targets declared by existing native manifests.

If the source plugin is ambiguous, ask one short question. Do not infer a write target from a
similarly named installed or cached plugin.

## 1. Establish safety and authority

1. Read the applicable repository instructions in both the AgentForge and source repositories.
2. Inspect version-control status in both repositories. Preserve unrelated and pre-existing
   changes.
3. Read AgentForge's current `README.md`, `src/definitions.ts`, and target adapters as needed.
   Treat the implementation as authoritative when examples and schemas disagree.
4. Work from regular files inside the plugin root. Identify symbolic links without following
   them; AgentForge package payloads reject symbolic-link sources.
5. Keep all generated trials outside the source repository until cutover is explicitly approved.

## 2. Inventory the native plugin

Build a complete relative-path inventory, including file modes, before proposing definitions.
Inspect at least:

- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`;
- `skills/*/SKILL.md`, including nested `scripts/`, `references/`, `assets/`, and
  `agents/openai.yaml` sidecars;
- package-level `agents/`, `commands/`, and hooks;
- package-root references, configuration, templates, licenses, documentation, and executables;
- target-native files and arbitrary nested supporting files.

Record the machine-reported regular-file total. Before presenting the inventory, reconcile that
total against the disposition rows: counts must match, no path may appear twice, and the
unclassified count must be zero. Fix a mismatch instead of estimating or hand-correcting the
summary.

Classify every regular file into exactly one disposition:

- canonical artifact;
- shared supplied payload;
- target-specific supplied payload;
- native metadata represented in `defaults`, `targets.<target>.overrides`, or
  `targets.<target>.native`;
- intentionally excluded, with a reason;
- unsupported construct requiring an explicit compatibility disposition.

Do not declare generated marketplace registries or plugin manifests as supplied payloads. Do not
assume a file is portable merely because both runtimes can read Markdown.

## 3. Draft the preview

Produce a review packet before editing source files:

1. A proposed `PACKAGE.yaml`.
2. A proposed `MARKETPLACE.yaml` addition or amendment, when enrollment is in scope.
3. A path-disposition table covering the complete inventory.
4. A compatibility report grouped by target and construct.
5. A short list of unresolved choices and assumptions.

State the regular-file total, disposition-row total, duplicate count, and unclassified count next
to the path-disposition table.

Derive shared metadata from native manifests and explicit structured sources. Do not mine README
prose for canonical metadata. Keep target-specific exceptions beside the affected package
definition.

For every agent, command, hook, body interpolation, tool policy, executable, or native sidecar,
state whether AgentForge preserves it, translates it, supplies it, or reports it as unsupported.
Never convert an AgentForge warning into an implicit acceptance decision.

Pause for review before writing unless the user has already approved this exact preview. An
instruction to "onboard this plugin" authorizes producing the preview, not silently choosing
semantic dispositions.

## 4. Apply the approved definition

After approval:

1. Add or update canonical definitions with focused patches.
2. Preserve native source bodies unless an approved target override or source remediation is
   required.
3. Use ordered payload declarations with explicit destinations, exclusions, executable intent,
   and collision policy.
4. Use `collision: override` only for an intentional exact replacement of generated or translated
   output; explain the replacement in the compatibility report.
5. Keep unsupported targets unenrolled rather than emitting knowingly misleading empty packages.

Do not add an importer or helper script during onboarding. Suggest deterministic automation only
after at least two migrations repeat the same transformation and the transformation has a stable,
lossless contract.

## 5. Validate behavior

Validate from a clean, temporary output root:

1. Load and validate the package and marketplace definitions.
2. Compile every declared publication.
3. Run `agentforge check` against the materialized output.
4. Run the installed Claude strict validator for Claude publications when available.
5. Run the repository's Codex-native marketplace validator when configured.
6. Compare expected and current native output paths, contents, and normalized modes.
7. Review every warning and note; resolve it with an override, documented unsupported disposition,
   or an explicit follow-up.

Do not claim behavioral parity from schema validation alone. For workflow-bearing skills, agents,
commands, or hooks, require a fresh-runtime smoke test before source-of-truth cutover.

## 6. Report the result

Return:

- definitions added or changed;
- inventory coverage and intentional exclusions;
- validation and native-check results;
- target-specific exceptions;
- unresolved blockers and their tracking handles;
- whether the plugin is ready for canonical enrollment, generated-output cutover, or neither.

Never describe onboarding as complete while any source file lacks a disposition or any compiler
warning remains unreviewed.
