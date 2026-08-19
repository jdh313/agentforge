# Changelog

## 0.2.0 (2026-08-19)


### Features

* add agent and command behavior models ([a9d17ac](https://github.com/jdh313/agentforge/commit/a9d17acf9bc76f95aa809475463b1caeecb0c8b6))
* add atomic marketplace materializer ([15447e5](https://github.com/jdh313/agentforge/commit/15447e569b279a289bfb9347a8d249a0baa6de95))
* add claude-chat target and output-style artifact ([ef67f60](https://github.com/jdh313/agentforge/commit/ef67f60dfa48bba16c0310173047f0eb36094cdd))
* add guided plugin onboarding skill ([5f05aa9](https://github.com/jdh313/agentforge/commit/5f05aa91234951a0afbf5d09f298e4e052fe36ed))
* add marketplace check command ([751e4ad](https://github.com/jdh313/agentforge/commit/751e4ad602690502715bbc1d9967978f9f7b5d5a))
* add marketplace compile command ([f2f8c7a](https://github.com/jdh313/agentforge/commit/f2f8c7a59e03c2626abb86c7ce925f6e513c5169))
* add marketplace compiler interface ([8254fef](https://github.com/jdh313/agentforge/commit/8254fef4ed89887ebe6b2a69196976b2550b2624))
* add native marketplace adapters ([f724d95](https://github.com/jdh313/agentforge/commit/f724d955310f7b0bd7a8cd4539639be25e40a1eb))
* add package and marketplace definitions ([bf2a622](https://github.com/jdh313/agentforge/commit/bf2a622a97e638d53dad9505f95c02e3fb77bcdb))
* add package payload declarations ([0695d63](https://github.com/jdh313/agentforge/commit/0695d63f64a43300c7070297934e3592a92edf92))
* add pure leaf artifact projection ([fe35e68](https://github.com/jdh313/agentforge/commit/fe35e68cb2eecd317751d671f7336fc61828b100))
* add target-native payload precedence ([2bad576](https://github.com/jdh313/agentforge/commit/2bad576f4ab384268ef1b7c6b72665b72da65ec0))
* **capabilities:** move Codex hook events into the capability table ([adc9a52](https://github.com/jdh313/agentforge/commit/adc9a5229f00c489f299eac03567701d56c4babd))
* **cli:** write a compilation report with compile --report &lt;path&gt; ([7c5ef5c](https://github.com/jdh313/agentforge/commit/7c5ef5c398c7d7aad1d393deb86573fa2a55435a))
* compile package plugin payloads ([5c4da89](https://github.com/jdh313/agentforge/commit/5c4da892afcad12be3ca0dc9cdca146d12bdf4eb))
* declare authoring-layer frontmatter keys in PACKAGE.yaml ([35b97d7](https://github.com/jdh313/agentforge/commit/35b97d7e5b06f9806a08428769e6c853f8a4bdb2))
* declare document class orthogonally to artifact type ([455e3da](https://github.com/jdh313/agentforge/commit/455e3daffb3a8d66f875e863a77ed3065b24502b))
* enforce deterministic compilation plans ([1c021e4](https://github.com/jdh313/agentforge/commit/1c021e47853ede92ef1a27a1927aeac7e5384ac4))
* fail Codex compilation on undeclared Claude-only constructs ([5724e24](https://github.com/jdh313/agentforge/commit/5724e2420465dae8012e6471ca1b4e4789a7c62c))
* initial agentforge codebase ([08b4754](https://github.com/jdh313/agentforge/commit/08b47544b807e7e956acd3ac5fef6e17f73ab4cf))
* **marketplace:** add root-manifest to publish an installable root copy ([5ebee74](https://github.com/jdh313/agentforge/commit/5ebee74ed22ee2d31353e675e404215af6f15e66))
* materialize package payloads safely ([01b668a](https://github.com/jdh313/agentforge/commit/01b668a96c2feca0f0df3a8fe9b303ae498aa5e9))
* project Codex lifecycle hooks ([661547a](https://github.com/jdh313/agentforge/commit/661547aca3b6f05b391f8300b48a85294590f76d))
* **release:** automate tagged releases with per-platform binaries ([84e54b0](https://github.com/jdh313/agentforge/commit/84e54b04d0f7249aa37b6241b8bfcbf21328b1fd))
* **report:** organise the compilation report by disposition, not severity ([cbea207](https://github.com/jdh313/agentforge/commit/cbea207ecdb6f4cdbf073f2f728df0f9cb43d9de))
* resolve translated constructs in the capability table ([649954b](https://github.com/jdh313/agentforge/commit/649954b28ca8ad538b5f2b8e0f20682c88e073c1))
* retain and report unrecognized canonical frontmatter keys ([7c45610](https://github.com/jdh313/agentforge/commit/7c456106110b734e781b172657f339f8e71e0404))
* translate agent and command package artifacts ([0697ff2](https://github.com/jdh313/agentforge/commit/0697ff24ad22c90a91c1f0abb1324ab56eb23e51))
* unify Claude-only construct detection behind a capability table ([d2f19e6](https://github.com/jdh313/agentforge/commit/d2f19e600e501e1a74961e2280ddc21eced95673))
* verify a declared loss's state against the emitted output ([2ecc654](https://github.com/jdh313/agentforge/commit/2ecc654eac6dcc4fe4f1dda710fda411097a5695))


### Bug Fixes

* **deps:** update dependency commander to v15 ([8165e26](https://github.com/jdh313/agentforge/commit/8165e2697318c6a694f96b65ebcaa2607d768d34))
* harden compilation plan integrity ([14f1025](https://github.com/jdh313/agentforge/commit/14f1025b22fa14a9ae600af63cd83ea922c796d3))
* harden plugin onboarding workflow ([15f5d4c](https://github.com/jdh313/agentforge/commit/15f5d4cf5e8e4638d6aec8d220dfdc770d4c6ef7))
* preserve explicit-only Codex skill invocation ([0009de4](https://github.com/jdh313/agentforge/commit/0009de4b6161b3d0f23b4ff10f2f8e4821c3d91e))
* preserve explicit-only Codex skill invocation ([7568c45](https://github.com/jdh313/agentforge/commit/7568c45df856a7e6447ab9f1491e826591018f1b))
* quote folded hook arguments and finish the disposition gate ([6a13939](https://github.com/jdh313/agentforge/commit/6a139391db406f12942bef73cb7a6c0728aa8556))
* report full MCP tool names in disposition errors ([c811343](https://github.com/jdh313/agentforge/commit/c811343bfd96595b8d656019ac3ca78374ad1ae4))
* revalidate payload sources before copying ([df96bdf](https://github.com/jdh313/agentforge/commit/df96bdfc2043f47dae2974221dac7ff5a6578f40))
* round-trip disallowed-tools into the Claude projection ([7a7922b](https://github.com/jdh313/agentforge/commit/7a7922b3123888b7dcc211c8628ebea4a333245e))
* stop reporting unrecognized shapes as confirmed Claude-only losses ([7c6b120](https://github.com/jdh313/agentforge/commit/7c6b120eaccdbca1ec00a7e8360142f53321db00))
