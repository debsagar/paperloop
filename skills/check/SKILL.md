---
name: check
description: Run every hard check on the paper now - compile, citations, references, banned bookkeeping phrases, length, page count, and number coverage against the registry (and the original, in revise mode). Use before showing anyone a draft, after any edit, or when asked "is the paper clean".
---

# Hard checks

All scripts are on the Bash PATH while paperloop is enabled (also at `${CLAUDE_PLUGIN_ROOT}/bin/`). Each exits non-zero on failure; a check that finds nothing to check fails too.

```bash
paperloop-validate MAIN_TEX --compile --max-pages PAGE_LIMIT_TOTAL --banned-file .paperloop/banned.txt \
    [--baseline-words N --length-tolerance 0.10]          # revise mode: N from the original
paperloop-numbers MAIN_TEX --registry .paperloop/registry.json [--original .paperloop/original/MAIN.tex]
paperloop-aitells MAIN_TEX [--baseline .paperloop/original/MAIN.tex]   # machine-prose habits per 1,000 words
```
- `paperloop-aitells` counts colon reveals, "not X but Y" pivots, self-posed questions, signposting, excess and Claude-favoured vocabulary and number-dump abstracts. Five human-written ML papers score 0-6.5 and two LLM-written drafts 17-19. With `--baseline` it fails if the paper scores higher than the baseline version. A low score does not prove human writing; for that, ask a person.

- `--max-pages` counts the whole PDF; if the venue limit is main-text only, check the page where references start yourself and say which you did.
- In revise mode the baseline word count is the original's (`paperloop-validate ORIGINAL --json` → `main_text_words`), stored in `.paperloop/state.json` by `/paperloop:improve`.
- Report each check's line verbatim. Do not summarise a FAIL as "mostly fine". Log a `check` event per check if a run is in progress.
