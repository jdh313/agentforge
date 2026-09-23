# [1.1.0](https://github.com/jdh313/agentforge/compare/v1.0.0...v1.1.0) (2026-09-23)


### Bug Fixes

* **codex:** restore project agent roles ([0e603b6](https://github.com/jdh313/agentforge/commit/0e603b6a1531d7fcc5cea4f257214b8140c16ff6))


### Features

* **claude:** support plugin-scoped agent installs ([2085f0b](https://github.com/jdh313/agentforge/commit/2085f0b392061872cfb2e60b69d58be813e2d8d8))
* **codex:** project artifact-scoped hooks ([59f88b1](https://github.com/jdh313/agentforge/commit/59f88b15ce85f5f494d0f90f0d20d2af1e755779))
* **compatibility:** model gated support explicitly ([5cb1b1b](https://github.com/jdh313/agentforge/commit/5cb1b1b5e2d2ef5b1ed8158742a24b103c287eda))

# [1.0.0](https://github.com/jdh313/agentforge/compare/v0.5.0...v1.0.0) (2026-09-18)


* feat(install)!: drop the inert Codex agent project scope ([c725c45](https://github.com/jdh313/agentforge/commit/c725c45b637b6aaefb17d2f9ab01be979ca3a5dd))


### Bug Fixes

* **capabilities:** correct the hook parity record and cite its source ([d9da868](https://github.com/jdh313/agentforge/commit/d9da868f3af505ecb73183099417227d80518525))
* **capabilities:** move Codex plugin-root translation to the hook surface ([ca5692c](https://github.com/jdh313/agentforge/commit/ca5692c246c82dc5901422e0fb4c91b7a4386bf0))
* **capabilities:** review followups for ndr:61cmc9 ([2e42a03](https://github.com/jdh313/agentforge/commit/2e42a0305f09f3a44be7fad7d085f86073a7bb08))


### Features

* **agent:** admit the Claude fields its loader enforces ([4c0c2df](https://github.com/jdh313/agentforge/commit/4c0c2dfbfbcbadc097b59c07ce513bebdf5192c2))
* **capabilities:** classify agent constructs on Codex and at leaf scope ([b16eabf](https://github.com/jdh313/agentforge/commit/b16eabfbb178cd15c2835f0ab382fe68e8d0c65c))
* **codex-hooks:** locate hook diagnostics at the event's key line ([5b22346](https://github.com/jdh313/agentforge/commit/5b2234619ce2d0a2c5addd93ef8819754cfd2b69))
* **compatibility:** detect an unregistrable collaborator reference ([32da2de](https://github.com/jdh313/agentforge/commit/32da2de799f00b73f1467fa5eea9b0a642e480ba)), closes [#23](https://github.com/jdh313/agentforge/issues/23)
* **install:** refuse cross-target collisions at a shared install destination ([88bc543](https://github.com/jdh313/agentforge/commit/88bc54342f44ba1a4815b2b0d4388ce04db7bfd1))
* **render:** give leaf body warnings per-occurrence source locations ([f9a2f3a](https://github.com/jdh313/agentforge/commit/f9a2f3a4abf0798804dd3c5690732d08aecc1e9f))
* **report:** carry source locations on compiler diagnostics ([a709f88](https://github.com/jdh313/agentforge/commit/a709f882275eb44ee91cb0dd5609d41e23f47fbd))


### BREAKING CHANGES

* `install --target codex --scope project` for an agent
now exits 1 instead of writing an unread file.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

# [0.5.0](https://github.com/jdh313/agentforge/compare/v0.4.0...v0.5.0) (2026-09-17)


### Features

* add first-class Claude agent rendering ([224dd63](https://github.com/jdh313/agentforge/commit/224dd6392a5b8181bfb433789de3ce5661c6c7ee))
* add scoped skill installation ([b95596f](https://github.com/jdh313/agentforge/commit/b95596fb90bb525bcf83605a50c7cb5cc5bb2ee9))
* **codex:** render canonical agents as native Codex TOML ([048c5a1](https://github.com/jdh313/agentforge/commit/048c5a1b34305282389a0b003a8c411eb3894c25))
* install file-layout agents without pruning siblings ([4052a7b](https://github.com/jdh313/agentforge/commit/4052a7bd21ceb8db0c9c21870632a3f8d2262b66))

# [0.4.0](https://github.com/jdh313/agentforge/compare/v0.3.0...v0.4.0) (2026-08-29)


### Features

* **check:** emit the check result as a machine-readable document ([ea562dc](https://github.com/jdh313/agentforge/commit/ea562dc1d799186f6ff51c86936c3363145513d9))

# [0.3.0](https://github.com/jdh313/agentforge/compare/v0.2.0...v0.3.0) (2026-08-29)


### Features

* **check:** gate managed output content on declared redactions ([993d262](https://github.com/jdh313/agentforge/commit/993d262b80af96ca606ee7395fdce7beca21505f))
* **check:** report a managed .json output that does not parse ([ea00271](https://github.com/jdh313/agentforge/commit/ea002718b91917525387eb7394a5a6afe29e49c3))

# [0.2.0](https://github.com/jdh313/agentforge/compare/v0.1.0...v0.2.0) (2026-08-20)


### Features

* **release:** automate tagged releases with per-platform binaries ([84e54b0](https://github.com/jdh313/agentforge/commit/84e54b04d0f7249aa37b6241b8bfcbf21328b1fd))
* **release:** switch from release-please to semantic-release ([56f6feb](https://github.com/jdh313/agentforge/commit/56f6febdd9882d26b43c4b6def02473766a3c40a))
