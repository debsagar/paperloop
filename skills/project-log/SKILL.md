---
name: project-log
description: Event-sourced research log (PROJECT-LOG.jsonl) plus the closed-decisions file (DECISIONS.md) that grows from it. Use at session start to replay project state, after any result, decision, bug or fix, before writing any claim into a paper or report, and when the user asks "where were we", "why did we decide X", or "is this settled". The log is the ledger; DECISIONS.md is the list of what is closed; paperloop's claims review and writer read both.
---

# project-log + DECISIONS.md

Two files at the project root, kept in step:
- `PROJECT-LOG.jsonl` — append-only events: what happened, with receipts.
- `DECISIONS.md` — the decisions that are closed, each pointing at the log events behind it. Nobody (human or agent) reopens a closed decision without a new event that says why.

## Start of session
1. Replay `PROJECT-LOG.jsonl` top to bottom. A `correction` supersedes the event it names; never edit or delete old lines. The tail is current state.
2. Read `DECISIONS.md`. Treat every entry with status `closed` as settled.
3. Reply with current state in five lines or less if the user asked "where were we".
If neither file exists, create the log with one `decision` event ("adopted an event log") plus what the README/git history already establishes, and create `DECISIONS.md` with the header below.

## Write path — one JSON line after every significant action
```json
{"ts": "2026-10-16T12:00:00Z", "type": "result", "text": "one line, numbers verbatim", "refs": ["path/or/url"], "by": "owner|agent"}
```
Types: `result`, `decision`, `bug`, `fix`, `insight`, `plan`, `correction` (names what it corrects), `paper` (a draft, review, evaluation or submission event).
- Real timestamps. No importance filter: when unsure, log.
- Numbers and errors verbatim from output. `result` and `insight` REQUIRE `refs` to ground truth (files, run dirs, commits). A number without a ref is not logged.
- A failure is an event: log the broken run with its error.
- `by` names who decided. "We decided" is not allowed.

## DECISIONS.md — the projection of `decision` events
```markdown
# Decisions
Closed decisions are not reopened without a new log event saying why.

## D<n>. <one-line decision>  — closed | open | reversed
- **Date / by:** 2026-10-16, owner
- **Because:** the evidence, with log refs (ts of the events) and file paths
- **Alternatives rejected:** what else was considered and why not
- **Reopen only if:** the concrete observation that would change it
```
- Every `decision` event the owner makes gets a `D<n>` entry in the same turn; increasing numbers, never renumbered.
- Reversing a decision: mark the old entry `reversed → D<m>`, add D<m>, and log a `decision` event whose text names both.
- Agent proposals are `open` until the owner confirms.

## How paperloop uses them
- `/paperloop:registry` and `/paperloop:claims-review` read the log for where each result came from, and refuse a number whose only source is prose.
- `/paperloop:claims-review` lists closed decisions that constrain the paper's claim (e.g. "the reference policy is not called optimal") and checks the draft respects them.
- Every paperloop run appends `paper` events (`improve` finished, `evaluate` verdict, lesson accepted) to `PROJECT-LOG.jsonl` with refs into `.paperloop/`.
- A lesson the owner accepts from `/paperloop:learn` is also a decision: log it and add a D-entry.

## Claims need receipts
Before any report, README or paper section is delivered: list every factual claim, open the ref behind each, restate conservatively anything the evidence does not support, and log the mismatch as a `correction`.
