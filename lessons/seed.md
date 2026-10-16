# Seed lessons (starting history)

These come from one author's papers on LLM evaluation. They are a starting point, not rules; your own `.paperloop/lessons.md` overrides them. Each line says what failed and what worked instead, and ends with its source:
[process] = observed while running the pipeline; [judge] = blind writing-judge reports on drafts; [venue-review] = official reviews of the author's rejected submissions.

1. Drafts written before anyone checked that the evidence could carry the claim scored 4/10 twice. Scope the claim to the evidence first (claims review), then write. [process]
2. A long list of binding style rules produced stilted, list-like prose ("uniform flat declaratives, no connectives"). A short positive brief plus a good example paper produced far better prose. Put style checks after drafting, not into it. [judge]
3. Project bookkeeping leaked into papers ("the log does not state...", run labels, condition codes). Readers have never seen the project; use ordinary descriptive names, fixed once introduced. [judge]
4. Results sections written as number dumps lost readers. Walk through one concrete example before the first table. [judge]
5. Revisions made papers "more defensible and less readable" when each reviewer point got its own hedge. State limitations once, in one place, plainly. [judge]
6. Text and tables disagreeing is the fastest way to lose a reviewer's trust. Numbers come from scripts; the text is checked against them. [process]
7. A claim that outruns its evidence is fixed by narrowing or dropping it, never by rewording it to sound supported. [process]
8. The introduction must state the finding; a reader who stops after page one should be able to repeat it. [judge]
9. Every comparison needs its n and an uncertainty. [venue-review]
10. Undefined or home-made terms were the most common clarity complaint. Define every term before use, or use the field's standard name. [venue-review]
11. Say what a reader learns that they did not know, and what they would do differently, in the introduction. [venue-review]
