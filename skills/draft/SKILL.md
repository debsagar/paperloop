---
name: draft
description: Write mode - one writer pass that drafts the whole paper from the claims review, the evidence registry, and the style anchor, then runs the hard checks. Use when the user wants a first draft from finished experiments.
---

# Draft

Preconditions (check, and stop with the reason if missing): `.paperloop/config.json` with `mode: write`; `.paperloop/registry.json` and `numbers.tex`; `.paperloop/claims_review.md` with no Required item that could overturn the claim; an anchor in config.

1. Snapshot whatever is in the paper directory: `paperloop-snapshot save PAPER_DIR draft-before`.
2. Launch the `paperloop:writer` subagent (fresh context) with `{FIELD}` filled in, the paper directory, template, page limit, anchor path and faults, and forbidden paths. Tell it to `\input{../.paperloop/numbers.tex}` (path relative to the paper) and use the macros for every result number in prose.
3. When it returns, run `/paperloop:check` yourself — do not trust the writer's report of its own checks.
4. Launch `paperloop:number-auditor` (fresh) with tag `draft`. A FAIL goes back to the writer once with the audit file; a second FAIL goes to the user.
5. Snapshot the result as `draft-1` and log a `paper` event. Then suggest `/paperloop:improve` in revise mode (set `mode: revise` and the new `main_tex`).
