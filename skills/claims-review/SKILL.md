---
name: claims-review
description: Sceptical claims-and-evidence review with a story plan, run by a fresh agent before drafting or revising. Use before /paperloop:draft, after every new batch of experiments, or when the user asks "what paper does this support" or "is this claim safe".
---

# Claims review

Launch the `paperloop:claims-reviewer` subagent (fresh context; it must not see this conversation's opinions about the result). Give it, filled in from `.paperloop/config.json`: the field, venue, experiment directories, registry paths, the current draft (if any), and the forbidden paths. Replace `{FIELD}` and `{VENUE}` in its instructions with the config values.

Also give it the closed decisions from `DECISIONS.md` that constrain claims, and tell it to check them.

When it returns:
1. Check `.paperloop/claims_review.md` exists and has the seven sections; if the agent could not write it, save its returned text there yourself.
2. Show the user: the one-sentence claim, the spot-check tally, and the "Required before drafting" list.
3. If any Required item could overturn the claim, stop and say so plainly: the next step is experiments, not prose.
4. Log a `paper` event to `PROJECT-LOG.jsonl` with the claim and a ref to the file.
