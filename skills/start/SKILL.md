---
name: start
description: Welcome and setup for paperloop. Use when the user first installs paperloop, says "set up paperloop", "start a paper", "where are we with the paper", or runs /paperloop:start. Interviews the user, writes .paperloop/config.json, and shows the commands and current state.
---

# paperloop: start here

paperloop turns a project's experiment results (and an existing draft, if there is one) into a paper, then improves the paper with a review-and-revise loop that learns from its own history. Numbers come from scripts, never from prose. Every gate is a script that exits non-zero.

## If `.paperloop/config.json` exists
Show the user, in five lines or less: the paper, venue, last run (`paperloop-log summary --log .paperloop/runs.jsonl`), open lessons proposals (`ls .paperloop/proposals/`), and the next suggested command. Then stop.

## Otherwise: welcome, then set up
Say this first, in your own words, in under 120 words:
> paperloop has two modes. **write**: experiments → claims review → draft. **revise**: an existing paper → N rounds of blind review, triage and small presentation-only edits, with every number locked. Afterwards `/paperloop:evaluate` compares original vs final blind, and `/paperloop:learn` turns what went wrong into lessons for the next paper. Nothing here spends money unless you turn on paid cross-model review.

Then ask only what you cannot find yourself (look first: `*.tex` with `\documentclass`, result dirs, `PROJECT-LOG.jsonl`, `DECISIONS.md`, a venue's `.sty`):
1. Mode (write / revise) and the main `.tex` file (or where the paper should go).
2. Target venue, its rating scale, page limit for the main text.
3. The field, in a phrase (sets reviewer expertise).
4. Where the results live (directories with raw per-run/per-instance files).
5. Style anchor: a paper they consider well written for this venue (path or arXiv id). If none, `/paperloop:anchor` will propose candidates for them to confirm.
6. Paths the loop must never read (held-out reviews, private notes).
7. Cross-family review: off, free OpenRouter models (needs `OPENROUTER_API_KEY` or an env-file path; never print the key), or paid with a dollar cap.

Write `.paperloop/config.json` (fields below), create `.paperloop/lessons.md` (empty header: "# Lessons for this project"), and copy `${CLAUDE_PLUGIN_ROOT}/templates/banned.txt` to `.paperloop/banned.txt`. Check the toolchain: `paperloop-validate MAIN_TEX --compile` (needs tectonic, latexmk or pdflatex; if none, tell them `curl --proto '=https' -fsSL https://drop-sh.fullyjustified.net | sh` installs tectonic). If `PROJECT-LOG.jsonl` does not exist, offer `/paperloop:project-log` to start one.

```json
{
  "plugin_root": "${CLAUDE_PLUGIN_ROOT}",
  "mode": "revise",
  "paper_id": "short-slug",
  "paper_dir": "paper",
  "main_tex": "paper/main.tex",
  "experiments_dirs": ["results/"],
  "venue": "NeurIPS 2026 workshop X",
  "scale": "1-10 (3 reject, 4 borderline reject, 5 borderline accept, 6 weak accept, 7 accept)",
  "field": "LLM agent evaluation",
  "page_limit": 9,
  "length_tolerance": 0.10,
  "max_edits_per_iteration": 8,
  "iterations": 5,
  "anchor": {"path": null, "faults": []},
  "registry": ".paperloop/registry.json",
  "forbidden_paths": [],
  "xreview": {"enabled": false, "env_file": null, "models": null, "allow_paid": false, "max_usd": 0}
}
```
`plugin_root` must be the literal resolved path (it is substituted in this skill text). Commands to show at the end:

| Command | What it does |
|---|---|
| `/paperloop:registry` | build the evidence registry (every reportable number, from raw files) |
| `/paperloop:claims-review` | sceptical claims review + story plan before writing |
| `/paperloop:anchor` | choose and vet a style-anchor paper |
| `/paperloop:draft` | write mode: one writer pass |
| `/paperloop:check` | run all hard checks now |
| `/paperloop:review` | one blind review (+ cross-family) of the current paper |
| `/paperloop:improve` | the revision loop, N iterations |
| `/paperloop:evaluate` | original vs final, blind, both orders, with controls |
| `/paperloop:learn` | propose one lesson from history and replay-test it |
| `/paperloop:project-log` | project event log + DECISIONS.md |
