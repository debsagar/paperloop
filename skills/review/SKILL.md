---
name: review
description: One blind review of the current paper by a fresh held-out reviewer, optionally plus non-Claude reviewers via OpenRouter, with complaints triaged into presentation / claim scope / literature / execution / significance. Use when the user asks "what would a reviewer say", before submission, or to measure a version.
---

# Blind review

1. Compile the paper (`paperloop-validate MAIN_TEX --compile`). Copy the PDF to `.paperloop/reviews/<tag>/paper.pdf` under a neutral name (no title or version in the filename).
2. Launch `paperloop:blind-reviewer` (fresh context) with `{VENUE}`, `{FIELD}`, `{SCALE}` filled from config, the PDF path, and the output path `.paperloop/reviews/<tag>/claude.md`. It may read only that PDF.
3. If `xreview.enabled`: `paperloop-xreview review .paperloop/reviews/<tag>/paper.pdf --out .paperloop/reviews/<tag>/xfamily --venue ... --field ... --scale ... [--env-file ENV] [--models ...]`. Free models only unless config allows paid with a cap. Never print the key.
4. Triage: launch two `paperloop:triager` subagents independently on the weaknesses from all reviews; a complaint counts as presentation/claim_scope/literature only if both agree.
5. Show the user: scores per reviewer (say which model family each is), the presentation items, and the execution/significance items as a separate list for them — those need experiments or a different claim, not edits.

The review prompt used here is the HELD-OUT instrument. `/paperloop:improve` never uses it inside the loop, so it stays an honest measure.
