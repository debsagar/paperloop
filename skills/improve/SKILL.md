---
name: improve
description: Run the paperloop revision loop on the current paper - N iterations of persona review, double triage, presentation-only edits with numbers locked, hard checks, regression veto (Claude and optional non-Claude judges), byte-exact revert, and logging. Use when the user says "improve the paper", "run the loop", "do N rounds of revision".
---

# Improve (inner loop)

Preconditions — check and stop with the reason if missing: `.paperloop/config.json` (run `/paperloop:start`), `.paperloop/registry.json` (run `/paperloop:registry`), the paper compiles (`paperloop-validate MAIN_TEX --compile`).

Tell the user in two lines what will happen and roughly how long (each iteration is ~8-12 subagent calls; cross-family judging adds minutes per iteration on free models).

Start the workflow: Workflow tool with name `paperloop:improve-loop` (if that name is not found, use `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/improve-loop.js"`), args `{"iterations": N}` (default: config). To resume after a stop, pass `start_k` = the next iteration and the same `run_id`. To target one weakness, pass `personas`, e.g. `["machine-prose"]` to clean up AI-sounding prose; a revision may never add machine-prose habits relative to the version before it, and `/paperloop:evaluate` fails a final that reads more AI-written than the original.

Each iteration k:
1. Snapshot `itk-before`; compile; copy the PDF.
2. One persona reviewer (skim → machine-prose → close → positioning → numbers → hostile, cycling), fresh context, sees only the paper.
3. Two triagers, independently. A complaint reaches the reviser only if both label it presentation / claim_scope / literature.
4. Reviser: at most `max_edits_per_iteration` edits, each tagged with its complaint, no number changed, length within tolerance, reads the lessons files.
5. Hard checks (`paperloop-validate`, `paperloop-numbers --original`, `paperloop-aitells` against the pre-iteration version); one repair attempt; then revert.
6. Regression veto: judges compare before/after on the edited sections in both orders; revert if the previous version wins order-consistently (or wins the non-Claude majority).
7. Resolution check per complaint; everything logged to `.paperloop/runs.jsonl`; snapshot `itk-after`.

When it finishes: show the per-iteration table it returns (complaints, fixable, edits kept, reverted and why), the execution/significance complaints as a separate list for the owner, and suggest `/paperloop:evaluate`.
