# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub Security Advisories:
open the repository's **Security** tab and choose **Report a vulnerability**.
Please do not open a public issue for a security report.

Expect an acknowledgement within a week. There is no bounty programme.

## Scope

AgentForge is a build-time CLI. It reads canonical definitions (`PACKAGE.yaml`,
`MARKETPLACE.yaml`, `SKILL.md`) and writes compiled output trees. It runs with
whatever privileges the invoking user has, and it does not run as a service,
open a network listener, or handle credentials.

The security boundary that matters is **containment of writes and copies**: a
crafted definition or payload tree must not cause the compiler to read or write
outside the directories it was pointed at. Findings of that shape are in scope,
including:

- A `source:` or `destination:` payload entry that escapes the output root.
- A symlink that survives the guard in `src/materializer.ts` and causes a read
  or write outside the source or staging tree.
- An archive entry name that escapes on extraction of a bundled artifact.
- Any input that causes code execution during a compile.

Out of scope: the consequences of deliberately compiling a definition you do not
trust into a directory you care about, and the behaviour of the harnesses that
consume the output (Claude Code, Codex, OpenCode) once installed there.

## Known limitations

Documented gaps live in [`docs/limitations.md`](docs/limitations.md) and are not
vulnerabilities in themselves. A limitation that turns out to have a security
consequence is worth reporting even though it is already written down.
