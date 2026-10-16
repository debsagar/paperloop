---
name: evaluate
description: Blind final evaluation of original vs final paper - per-section and whole-paper side by side in both orders, held-out reviews (Claude and optional other model families), claim-strength audit, judge sanity controls (padding, planted wrong number), and optional mapping of official reviews. Use after /paperloop:improve or when asked "is the new version actually better".
---

# Evaluate

This measures packaging only. Complaints that need new experiments are listed but never scored.

1. Ask whether official/real reviews exist for the original. If yes, get their path, but do NOT open them yourself and do not put them anywhere under the project until this step; they are passed only to the final mapping agent.
2. Start the workflow: Workflow tool name `paperloop:evaluate` (fallback `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/evaluate.js"`), args `{"tag": "...", "official_reviews": "<path or omit>"}`.
3. Present `.paperloop/eval/<tag>/REPORT.md`: verdict first (PASS / FAIL / JUDGE_UNTRUSTED), then each signal. Name the model family behind every score. If the controls failed, say that no judge verdict in this report can be trusted.
4. Ask the owner (or a colleague who has not seen either version) one question per version, in a fixed order: "Does this read AI-generated? yes / somewhat / no". A "yes" on the final fails the evaluation whatever the judges said; record the answer as a `paper` event. Then offer a blind read for the owner: pick 3-5 sections, show each pair as A/B with the order fixed by section index parity (odd: original first), and record their choices as `owner_edit`-style notes in the log. Their read is the only non-model signal; say so.

Pass criteria (design choices, not validated): all hard checks; the final does not read more machine-written than the original (tell count and Claude meta-judge; the non-Claude meta-judge is reported but does not decide, because the free models tested could not tell human-written papers from LLM-written ones); both controls pass; final wins ≥4 sections order-consistently and original ≤1; final preferred on the whole paper and original by no judge family; and either held-out presentation complaints drop to ≤70% beyond the repeat-to-repeat noise with the presentation score not lower, or ≥50% of presentation-type official complaints are resolved/partial with no regressions.
