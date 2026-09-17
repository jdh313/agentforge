---
name: feedback-hunt-vendor-doc-before-unestablished
description: In agentforge, hunt for the vendor's own doc before declaring a construct unestablished or proposing a not-established diagnostic — a binary probe finding nothing is not evidence no doc exists
metadata:
  type: feedback
---

Before concluding a target's behavior is **unestablished** — and especially before proposing a `not-established` diagnostic for it — go find the vendor's published reference. A binary-strings probe that cannot discriminate between two explanations is a limit of the probe, not a fact about the world. And never report a construct the primary source documents as **supported**: that fires a warning on the common case and trains readers to ignore the channel.

**Why:** On Fibery #114 I verified hook blocking live on both harnesses, observed that a Claude-vocabulary `matcher: "Bash"` fired on a Codex shell tool, and could not tell whether Codex ignored `matcher` or aliased the tool name. I wrote it up as unestablished and proposed an `unclassified-hook-matcher` diagnostic. Then `learn.chatgpt.com/docs/hooks` turned up — a Codex primary source agentforge cited **nowhere** — which documents that `matcher` is an honored regex and that Codex deliberately speaks Claude's tool vocabulary ("Shell commands … Match as `Bash`"). The diagnostic was wrong to propose. I withdrew it; the team lead had independently held it and then said my reason was the stronger one. The real deliverable turned out to be the citation, not the code.

**How to apply:** Applies whenever a capability row, a parity doc, or a report is about to say "unestablished", "not classified", or "we have never confirmed this". Check: does the vendor publish a reference page, and has this repo ever cited it? A row resting on binary strings alone is a standing invitation to this mistake — the strings verify what exists, they cannot verify what a field *means*. Keep the binary evidence beside the doc rather than replacing it; they answer different questions. Also note that a conclusion can be wrong while the inference that produced it was sound — say so in the record rather than quietly swapping the text, or the next reader learns nothing.

Related: [[feedback-verify-dispatch-against-primary-evidence]], [[feedback-capability-citation-is-the-deliverable]]
