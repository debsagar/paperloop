---
name: anchor
description: Choose and vet a style-anchor paper - a well-written paper at the target venue the writer imitates for prose quality (not content). Use before drafting, or when the user asks which paper to model the writing on.
---

# Style anchor

An anchor beats a rulebook: the writer imitates how a good paper reads instead of obeying a list. But a bad anchor teaches bad habits, and the anchor must never be the paper being written or revised.

1. If the user named one, use it. Otherwise propose three candidates, in this order of preference: a recent accepted paper at the same venue and subfield known for clear writing; a well-cited paper in the subfield with a similar kind of result (benchmark, method, analysis); the user's own best-received paper. Verify each exists (title, authors, year, link). Never propose from memory alone.
2. Get the PDFs (ask the user, or download from arXiv if they agree). Save under `.paperloop/anchor/`.
3. Vet each with the `paperloop:judge` subagent's criteria applied to one paper: have a fresh subagent read it and list its three best writing qualities and three worst faults, with quotes.
4. The user confirms one. Write `anchor.path` and `anchor.faults` (the vetted faults, so the writer does not copy them) to `.paperloop/config.json`.
5. Refuse an anchor that is the paper itself, an earlier draft of it, or shares its text.
