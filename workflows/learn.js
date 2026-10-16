export const meta = {
  name: 'learn',
  description: 'paperloop outer loop: read run history, propose ONE lesson or check, replay it against logged iterations (new vs old, plus a null old-vs-old replay), and mark it for owner approval',
  whenToUse: 'After one or more /paperloop:improve runs, to turn recurring failures into a lesson the next revision reads. Never edits the plugin; writes only to .paperloop/.',
  phases: [
    { title: 'Propose', detail: 'lessons agent reads runs.jsonl and proposes one change' },
    { title: 'Replay', detail: 'revise logged iterations with old vs new lessons, and old vs old' },
    { title: 'Judge', detail: 'both orders, order-consistent verdicts only' },
    { title: 'Record', detail: 'tier decision, proposal file, run log' },
  ],
}

// args (optional): { max_replays (default 5), reps (default 2) }
const A = args || {}
const MAXR = A.max_replays || 5, REPS = A.reps || 2

const SETUP = { type: 'object', required: ['ok', 'root', 'field', 'paper_id', 'iters'], properties: {
  ok: { type: 'boolean' }, error: { type: 'string' }, root: { type: 'string' }, field: { type: 'string' }, paper_id: { type: 'string' }, max_edits: { type: 'number' },
  iters: { type: 'array', items: { type: 'object', required: ['tag', 'before_dir', 'main_rel', 'fixable_json'], properties: { tag: { type: 'string' }, before_dir: { type: 'string' }, main_rel: { type: 'string' }, fixable_json: { type: 'string' }, baseline_words: { type: 'number' }, registry: { type: 'string' }, orig_tex: { type: 'string' } } } } } }
const PROPOSAL = { type: 'object', required: ['lid', 'kind', 'text', 'evidence_cids'], properties: { lid: { type: 'string' }, kind: { type: 'string', enum: ['check', 'lesson'] }, text: { type: 'string' }, replaces: { type: 'string' }, evidence_cids: { type: 'array', items: { type: 'string' } }, evidence_summary: { type: 'string' }, predicted_effect: { type: 'string' } } }
const DONE = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }
const CHECKRES = { type: 'object', required: ['fires_on', 'false_positives'], properties: { fires_on: { type: 'array', items: { type: 'string' } }, false_positives: { type: 'array', items: { type: 'string' } }, detail: { type: 'string' } } }
const VERDICT = { type: 'object', required: ['winner'], properties: { winner: { type: 'string', enum: ['X', 'Y', 'tie'] } } }

// The plugin root is read by a dedicated step and checked here: an agent asked to return many
// fields once rewrote it as a project-relative path, and every later step then lost its prompts.
const ROOT_SCHEMA = { type: 'object', required: ['root'], properties: { root: { type: 'string' } } }
async function pluginRoot(phaseName) {
  for (let i = 0; i < 2; i++) {
    const r = await agent(`Run exactly: python3 -c "import json;print(json.load(open('.paperloop/config.json'))['plugin_root'])"  then run: ls <that path>/bin/paperloop-validate <that path>/agents/judge.md. If both exist return root = that path, verbatim. If not, search ~/.claude/plugins and /data for a directory containing bin/paperloop-validate and agents/ai-prose-judge.md and return it.`,
      { label: `plugin-root${i ? '-retry' : ''}`, phase: phaseName, schema: ROOT_SCHEMA, model: 'sonnet', effort: 'low' })
    if (r && r.root && r.root.startsWith('/')) return r.root.replace(/\/$/, '')
  }
  return null
}

phase('Propose')
const S = await agent(
  `Project root = current directory. Read .paperloop/config.json and .paperloop/state.json. root = the value of config.plugin_root copied verbatim (the plugin's install directory, NOT the project directory); confirm root/bin/paperloop-log and root/agents/lessons-agent.md exist, else ok=false with error. List logged iterations: for each directory .paperloop/iters/it*/ that has events.json AND a snapshot .paperloop/snapshots/<tag>-before/, return tag, before_dir (.paperloop/snapshots/<tag>-before/files), main_rel (main tex path relative to the paper dir), and fixable_json: the complaints from events.json whose final_label is presentation, claim_scope or literature, as a JSON string of [{cid, section, quote, final_label}]. Skip iterations with no such complaints. Also return field, paper_id, max_edits (config.max_edits_per_iteration or 8), and per iteration baseline_words (state), registry (config.registry), orig_tex (state). ok=false if .paperloop/runs.jsonl is missing.`,
  { label: 'history', phase: 'Propose', schema: SETUP, model: 'sonnet', effort: 'low' })
if (!S || !S.ok) return { ok: false, error: S ? S.error : 'setup failed' }
const R = await pluginRoot('Propose')
if (!R) return { ok: false, error: 'could not resolve the plugin root (config.plugin_root)' }
const prop = await agent(
  `Read ${R}/agents/lessons-agent.md (ignore its YAML header) and follow it. Plugin seed lessons: ${R}/lessons/seed.md. Use lid "L" + the next free number in .paperloop/proposals/. Scripts are in ${R}/bin/.`,
  { label: 'lessons-agent', phase: 'Propose', schema: PROPOSAL })
if (!prop || !prop.text || prop.lid === 'NONE' || !prop.evidence_cids.length) return { ok: false, error: 'no usable proposal', proposal: prop }
log(`proposal ${prop.lid} (${prop.kind}): ${prop.text.slice(0, 120)}`)

let decision, evidence = {}
if (prop.kind === 'check') {
  // deterministic: show where it fires; no judge needed
  const c = await agent(
    `A proposed banned-phrase regex for paperloop-validate: ${JSON.stringify(prop.text)}. Test it (Python re, IGNORECASE) against: the original paper (state.orig_tex and its \\input files), every .paperloop/snapshots/*-before/files/*.tex, and the current paper. fires_on = files+quoted matches where it catches what the evidence (${prop.evidence_cids.join(', ')}) describes; false_positives = matches in legitimate prose. Do not edit anything.`,
    { label: 'test-check', phase: 'Replay', schema: CHECKRES, model: 'sonnet', effort: 'low' })
  evidence = c || {}
  decision = c && c.fires_on.length && !c.false_positives.length ? 'ready_for_owner' : 'rejected'
} else {
  phase('Replay')
  const iters = S.iters.slice(0, MAXR)
  if (iters.length < MAXR) log(`only ${iters.length} logged iterations with fixable complaints (asked for ${MAXR})`)
  const jobs = []
  iters.forEach(it => { for (let r = 1; r <= REPS; r++) jobs.push({ it, r }) })
  const mk = (job, cond) => `.paperloop/replay/${prop.lid}/${job.it.tag}-${cond}-${job.r}`
  const revise = (job, cond, lessonsNote) => agent(
    `Replay test. First run: rm -rf ${mk(job, cond)} && mkdir -p ${mk(job, cond)} && cp -r ${job.it.before_dir}/. ${mk(job, cond)}/
Then read ${R}/agents/reviser.md (ignore its YAML header) and follow it on PAPER=${mk(job, cond)}/${job.it.main_rel}, MAX_EDITS=${S.max_edits}, BASELINE_WORDS=${job.it.baseline_words}, LENGTH_TOL=10%, LENGTH_TOL_FRAC=0.10, REGISTRY=${job.it.registry}, ORIGINAL_TEX=${job.it.orig_tex}. Scripts in ${R}/bin/. ${lessonsNote} Edit only files inside ${mk(job, cond)}. Do not read .paperloop/runs.jsonl, reviews, or other replay folders.
Complaints:
${job.it.fixable_json}`,
    { label: `${job.it.tag}-${cond}-${job.r}`, phase: 'Replay' })
  const OLD = `For lessons, read ${R}/lessons/seed.md and .paperloop/lessons.md as they are now.`
  const NEW = `For lessons, read ${R}/lessons/seed.md and .paperloop/lessons.md, and apply this change to the project lessons: ${prop.replaces ? `replace the line ${JSON.stringify(prop.replaces)} with` : 'add'} ${JSON.stringify(prop.text)}.`
  const judgeP = (x, y) => `Read ${R}/agents/judge.md (ignore its YAML header) and follow it, field: ${S.field}. Compare the sections that differ between the two files. Version X is ${x}. Version Y is ${y}. Read nothing else.`
  async function pair(label, a, b) {
    const [j1, j2] = await parallel([
      () => agent(judgeP(a, b), { label: `${label}-1`, phase: 'Judge', schema: VERDICT, model: 'sonnet' }),
      () => agent(judgeP(b, a), { label: `${label}-2`, phase: 'Judge', schema: VERDICT, model: 'sonnet' }),
    ])
    if (!j1 || !j2) return 'missing'
    if (j1.winner === 'X' && j2.winner === 'Y') return 'a'
    if (j1.winner === 'Y' && j2.winner === 'X') return 'b'
    return 'tie'
  }
  const results = await pipeline(jobs,
    job => parallel([() => revise(job, 'old', OLD), () => revise(job, 'new', NEW), () => revise(job, 'old2', OLD)]).then(() => job),
    job => parallel([
      () => pair(`NvO-${job.it.tag}-${job.r}`, `${mk(job, 'new')}/${job.it.main_rel}`, `${mk(job, 'old')}/${job.it.main_rel}`),
      () => pair(`null-${job.it.tag}-${job.r}`, `${mk(job, 'old2')}/${job.it.main_rel}`, `${mk(job, 'old')}/${job.it.main_rel}`),
    ]).then(([nvo, nul]) => ({ tag: job.it.tag, rep: job.r, new_vs_old: nvo, null_replay: nul })))
  const rs = results.filter(Boolean)
  const dec = rs.filter(r => r.new_vs_old === 'a' || r.new_vs_old === 'b')
  const newWins = dec.filter(r => r.new_vs_old === 'a').length
  const nullDec = rs.filter(r => r.null_replay === 'a' || r.null_replay === 'b').length
  const winRate = dec.length ? newWins / dec.length : 0
  const nullRate = rs.length ? nullDec / rs.length : 0
  evidence = { pairs: rs, decisive: dec.length, new_wins: newWins, win_rate: winRate, null_decisive_rate: nullRate }
  // Tier 1 (project-local, provisional): >=6 decisive, >=75% new wins, decisive rate clearly above the null replay's
  decision = dec.length < 6 ? 'insufficient_evidence' : (winRate >= 0.75 && dec.length / rs.length > nullRate + 0.2 ? 'ready_for_owner' : 'rejected')
}

phase('Record')
const rec = { ...prop, status: decision, evidence }
await agent(
  `Write .paperloop/proposals/${prop.lid}.json with exactly this JSON. Then run: ${R}/bin/paperloop-log lesson_proposal '${JSON.stringify({ run_id: 'learn-' + prop.lid, paper_id: S.paper_id, lid: prop.lid, status: decision })}' --log .paperloop/runs.jsonl
Do NOT edit .paperloop/lessons.md or .paperloop/banned.txt — the owner approves first via /paperloop:learn.
${JSON.stringify(rec)}`,
  { label: 'record', phase: 'Record', schema: DONE, model: 'sonnet', effort: 'low' })
return rec
