---
name: learn
description: The outer improvement loop - learn from history. Proposes one lesson or check from .paperloop/runs.jsonl, replay-tests it against logged iterations, and asks the owner to accept or reject. Use after a revision run, when the same complaint keeps coming back, or when the user asks "what should the process learn from this".
---

# Learn (outer loop)

History lives in `.paperloop/runs.jsonl` (machine log of every review, triage, edit, check, judge and evaluation) and `PROJECT-LOG.jsonl` / `DECISIONS.md` (the human ledger). Lessons live in three layers, read by the writer and reviser in this order: plugin `lessons/seed.md` (starting history, labelled as such) → `~/.claude/paperloop/lessons.md` (yours, across projects) → `.paperloop/lessons.md` (this project). The plugin's own skills are never edited by the loop.

1. Run the workflow: name `paperloop:learn` (fallback `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/learn.js"`).
   - A **check** proposal (a banned-phrase regex) is tested deterministically against old snapshots; no judge.
   - A **lesson** proposal is replayed: for each logged iteration with fixable complaints, the reviser runs twice with the old lessons, once with the new; judges compare new-vs-old and old-vs-old (the null replay) in both orders.
   - Status: `ready_for_owner` (≥6 decisive pairs, ≥75% new wins, decisive rate well above the null replay), `insufficient_evidence`, or `rejected`.
2. Show the owner the proposal text, the evidence complaints (quoted), and the replay numbers. Say plainly that with one paper this is weak evidence.
3. Only on the owner's yes: apply it (`.paperloop/lessons.md` — replace the named line if any, keep ≤15 items — or append the regex to `.paperloop/banned.txt`), log a `decision` event in `PROJECT-LOG.jsonl` and add a `D<n>` entry to `DECISIONS.md` (see `/paperloop:project-log`).
4. Promotion to `~/.claude/paperloop/lessons.md` (all your projects): only if the same lesson was accepted in 2+ projects. Promotion into the plugin itself (for the whole team): open a pull request with the evidence bundle — the lesson must recur in 3+ papers' logs and pass a pooled replay over 5+ papers. Until then it is provisional.
5. A lesson auto-expires if the next paper's `/paperloop:evaluate` is worse than its baseline: mark it `expired` in `.paperloop/lessons.md` and log it.
