export const meta = {
  name: 'improve-loop',
  description: 'paperloop inner loop: N rounds of persona review, double triage, presentation-only revision, hard checks, regression veto and logging',
  whenToUse: 'Revise an existing paper in place with numbers locked. Needs .paperloop/config.json and .paperloop/registry.json (run /paperloop:start and /paperloop:registry first).',
  phases: [
    { title: 'Setup', detail: 'read config, snapshot original, baseline, run_start' },
    { title: 'Review', detail: 'persona reviewer + two independent triagers' },
    { title: 'Revise', detail: 'presentation-only edits, numbers locked' },
    { title: 'Check', detail: 'hard checks, repair once, regression judges both orders' },
    { title: 'Log', detail: 'resolution check + run log' },
  ],
}

// args (optional): { iterations, run_id, start_k, personas: [...] }
const A = args || {}
const PERSONAS = (A.personas && A.personas.length) ? A.personas : ['skim', 'machine-prose', 'close', 'positioning', 'numbers', 'hostile']
const FIX = ['presentation', 'claim_scope', 'literature']

const CONFIG_SCHEMA = {
  type: 'object',
  required: ['ok', 'root', 'paper_dir', 'main_tex', 'orig_tex', 'registry', 'venue', 'field', 'baseline_words', 'length_tolerance', 'max_edits', 'iterations', 'run_id', 'paper_id', 'forbidden', 'xreview_cmd'],
  properties: {
    ok: { type: 'boolean' }, error: { type: 'string' },
    root: { type: 'string' }, paper_dir: { type: 'string' }, main_tex: { type: 'string' }, orig_tex: { type: 'string' },
    registry: { type: 'string' }, venue: { type: 'string' }, field: { type: 'string' },
    baseline_words: { type: 'number' }, length_tolerance: { type: 'number' }, max_edits: { type: 'number' },
    iterations: { type: 'number' }, run_id: { type: 'string' }, paper_id: { type: 'string' },
    forbidden: { type: 'array', items: { type: 'string' } }, xreview_cmd: { type: 'string' },
  },
}
const COMPLAINTS = {
  type: 'object', required: ['persona', 'complaints'],
  properties: {
    persona: { type: 'string' },
    complaints: { type: 'array', items: { type: 'object', required: ['cid', 'section', 'quote', 'problem', 'severity', 'type_guess'],
      properties: { cid: { type: 'string' }, section: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' },
        suggested_fix: { type: 'string' }, severity: { type: 'string' }, type_guess: { type: 'string' } } } },
  },
}
const LABELS = {
  type: 'object', required: ['labels'],
  properties: { labels: { type: 'array', items: { type: 'object', required: ['cid', 'labels'],
    properties: { cid: { type: 'string' }, labels: { type: 'array', items: { type: 'string', enum: ['presentation', 'claim_scope', 'literature', 'execution', 'significance'] } }, fixable_part: { type: 'string' }, reason: { type: 'string' } } } } },
}
const EDITS = {
  type: 'object', required: ['edits', 'skipped', 'checks_pass'],
  properties: {
    edits: { type: 'array', items: { type: 'object', required: ['eid', 'cid', 'section', 'summary', 'numbers_changed'],
      properties: { eid: { type: 'string' }, cid: { type: 'string' }, section: { type: 'string' }, summary: { type: 'string' }, numbers_changed: { type: 'boolean' }, claim_narrowed: { type: 'boolean' } } } },
    skipped: { type: 'array', items: { type: 'object', properties: { cid: { type: 'string' }, reason: { type: 'string' } } } },
    checks_pass: { type: 'boolean' },
  },
}
const CHECKS = {
  type: 'object', required: ['pass', 'checks'],
  properties: { pass: { type: 'boolean' }, words: { type: 'number' }, checks: { type: 'array', items: { type: 'object', required: ['name', 'pass'], properties: { name: { type: 'string' }, pass: { type: 'boolean' }, detail: { type: 'string' } } } } },
}
const VERDICT = {
  type: 'object', required: ['winner'],
  properties: { winner: { type: 'string', enum: ['X', 'Y', 'tie'] }, confidence: { type: 'number' }, reasons: { type: 'array', items: { type: 'string' } } },
}
const XVERDICT = {
  type: 'object', required: ['votes'],
  properties: { votes: { type: 'array', items: { type: 'object', required: ['model', 'prefers'], properties: { model: { type: 'string' }, prefers: { type: 'string', enum: ['before', 'after', 'tie', 'error'] } } } } },
}
const RESOLVED = {
  type: 'object', required: ['results'],
  properties: { results: { type: 'array', items: { type: 'object', required: ['cid', 'resolution'], properties: { cid: { type: 'string' }, resolution: { type: 'string', enum: ['resolved', 'partial', 'no', 'not_attempted'] }, evidence: { type: 'string' } } } } },
}
const DONE = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }

// ---------- setup ----------
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

phase('Setup')
const C = await agent(
  `You are the setup step of the paperloop revision loop. The project root is the current working directory.
1. Read .paperloop/config.json. If it or its "registry" file is missing, return ok=false with error saying to run /paperloop:start and /paperloop:registry.
2. root = config.plugin_root copied verbatim — the plugin's install directory, NOT the project directory (check that root/bin/paperloop-validate exists; if not, search for a directory containing bin/paperloop-validate and agents/persona-reviewer.md under ~/.claude/plugins and use it).
3. If .paperloop/state.json exists, read it and reuse its orig_tex, baseline_words, paper_id. Otherwise:
   - copy the whole paper directory to .paperloop/original/ (cp -r; make it read-only with chmod -R a-w),
   - run: root/bin/paperloop-snapshot save PAPER_DIR original --root .paperloop
   - run: root/bin/paperloop-validate MAIN_TEX --json  and read main_text_words as baseline_words,
   - orig_tex = the path of the main .tex inside .paperloop/original/,
   - write .paperloop/state.json with {orig_tex, baseline_words, paper_id, created: <date -u +%FT%TZ>}.
4. run_id: ${A.run_id ? `use "${A.run_id}"` : 'run `date -u +%Y%m%dT%H%M%SZ` and use "improve-" + that'}.
5. xreview_cmd: if config.xreview.enabled, the command prefix "ROOT/bin/paperloop-xreview" plus " --env-file ENV" if config.xreview.env_file, plus " --models M" if config.xreview.models, plus " --allow-paid --max-usd X" only if config.xreview.allow_paid; else "".
6. Log run_start: root/bin/paperloop-log run_start '{"run_id":..., "paper_id":..., "plugin_version":"<version from root/.claude-plugin/plugin.json>", "mode":"revise", "original_sha256":"<sha256sum of orig_tex>"}' --log .paperloop/runs.jsonl
Return the fields. iterations = ${A.iterations || 'config.iterations (default 5)'}; max_edits = config.max_edits_per_iteration (default 8); length_tolerance = config.length_tolerance (default 0.10); forbidden = config.forbidden_paths.`,
  { label: 'setup', phase: 'Setup', schema: CONFIG_SCHEMA, model: 'sonnet' })

if (!C || !C.ok) { return { ok: false, error: C ? C.error : 'setup agent failed' } }
const R = await pluginRoot('Setup')
if (!R) { return { ok: false, error: 'could not resolve the plugin root (config.plugin_root)' } }
const NEVER = C.forbidden.length ? `Never read or list these paths: ${C.forbidden.join(', ')}. ` : ''
const BLIND = `${NEVER}Do not read anything under .paperloop/ except files you are explicitly given. Do not use web search or web fetch to look up this paper.`
log(`run ${C.run_id}: ${C.iterations} iterations on ${C.main_tex} (baseline ${C.baseline_words} words)`)

const summary = []
const startK = A.start_k || 1
for (let k = startK; k < startK + C.iterations; k++) {
  const persona = PERSONAS[(k - startK) % PERSONAS.length]
  const tag = `it${k}`
  const events = []

  // ---------- review ----------
  phase('Review')
  const prep = await agent(
    `Run, from the project root: ${R}/bin/paperloop-snapshot save ${C.paper_dir} ${tag}-before --root .paperloop  (if the tag exists already, run restore instead of save — this is a resumed run). Then ${R}/bin/paperloop-validate ${C.main_tex} --compile and copy the compiled PDF to .paperloop/iters/${tag}/paper.pdf (mkdir -p). Return ok=true if the PDF exists, with any compile error in detail.`,
    { label: `prep-${tag}`, phase: 'Review', schema: DONE, model: 'sonnet', effort: 'low' })
  if (!prep || !prep.ok) { log(`${tag}: could not compile/snapshot — stopping`); summary.push({ k, stopped: true, detail: prep && prep.detail }); break }

  const revPrompt = persona === 'machine-prose'
    ? `Read ${R}/agents/ai-prose-judge.md (ignore its YAML header) and use its catalogue of machine-prose habits, field: ${C.field}. First run ${R}/bin/paperloop-aitells ${C.main_tex} --json and use its counts and examples to know where to look. Read the source ${C.main_tex} (and files it \\input's). Then, INSTEAD of that file's output format, return each of your worst passages (at most 10) as a complaint in this JSON shape: {"persona": "machine-prose", "complaints": [{"cid": "k${k}-machine-prose-<n>", "section": "...", "quote": "exact text", "problem": "which habit, and why a reader takes it as model-written", "suggested_fix": "your plain rewrite, same numbers and claims", "severity": "high|medium|low", "type_guess": "presentation"}]}. ${BLIND}`
    : `Read ${R}/agents/persona-reviewer.md (ignore its YAML header) and follow it. Your PERSONA is "${persona}". The paper is for ${C.venue}, field: ${C.field}. Read the PDF .paperloop/iters/${tag}/paper.pdf and its source ${C.main_tex} (and files it \\input's). Use cid prefix k${k}-${persona}-. ${BLIND}`
  const rev = await agent(revPrompt, { label: `review-${tag}-${persona}`, phase: 'Review', schema: COMPLAINTS, model: 'sonnet' })
  const complaints = (rev && rev.complaints) || []

  const triage = await parallel([0, 1].map(i => () => agent(
    `Read ${R}/agents/triager.md (ignore its YAML header) and follow it. You are triager ${i + 1} of 2, working independently. The paper source is ${C.main_tex}; its evidence registry is ${C.registry}. ${BLIND}
Complaints:
${JSON.stringify(complaints, null, 1)}`,
    { label: `triage${i + 1}-${tag}`, phase: 'Review', schema: LABELS, model: 'sonnet' })))
  // each triager gives a SET of labels per complaint id; a complaint reaches the reviser only for the
  // fixable labels BOTH triagers gave it. Missing labels count as not fixable.
  const lab = triage.map(t => Object.fromEntries(((t && t.labels) || []).map(l => [l.cid, l.labels || []])))
  const fixPart = Object.fromEntries(triage.flatMap(t => ((t && t.labels) || []).filter(l => l.fixable_part).map(l => [l.cid, l.fixable_part])))
  const allCids = complaints.map(c => c.cid)
  const agreedFix = cid => FIX.filter(x => ((lab[0] || {})[cid] || []).includes(x) && ((lab[1] || {})[cid] || []).includes(x))
  const finalLabel = cid => {
    const ag = agreedFix(cid)
    if (ag.length) return ag[0]
    const any = [...((lab[0] || {})[cid] || []), ...((lab[1] || {})[cid] || [])].find(x => !FIX.includes(x))
    return any || 'execution'
  }
  const byCid = Object.fromEntries(complaints.map(c => [c.cid, c]))
  const fixable = allCids.filter(cid => agreedFix(cid).length).map(cid => ({ ...byCid[cid], labels: agreedFix(cid), fix_only: fixPart[cid] || '' }))
  log(`${tag} (${persona}): ${complaints.length} complaints, ${fixable.length} fixable by words`)

  // ---------- revise ----------
  phase('Revise')
  let edits = { edits: [], skipped: [], checks_pass: true }
  if (fixable.length) {
    edits = (await agent(
      `Read ${R}/agents/reviser.md (ignore its YAML header) and follow it, with MAX_EDITS=${C.max_edits}, BASELINE_WORDS=${C.baseline_words}, LENGTH_TOL=${Math.round(C.length_tolerance * 100)}%, LENGTH_TOL_FRAC=${C.length_tolerance}, PAPER=${C.main_tex}, REGISTRY=${C.registry}, ORIGINAL_TEX=${C.orig_tex}. Plugin scripts are in ${R}/bin/ and the plugin's lessons/seed.md is at ${R}/lessons/seed.md. Use edit ids e${k}-1, e${k}-2, ... ${BLIND}
Complaints to address (already triaged; "labels" says how; if "fix_only" is set, fix only that part):
${JSON.stringify(fixable, null, 1)}`,
      { label: `revise-${tag}`, phase: 'Revise', schema: EDITS })) || edits
  }

  // ---------- check ----------
  phase('Check')
  const checkPrompt = `From the project root run both and report every check:
${R}/bin/paperloop-validate ${C.main_tex} --compile --json --banned-file .paperloop/banned.txt --baseline-words ${C.baseline_words} --length-tolerance ${C.length_tolerance}
${R}/bin/paperloop-numbers ${C.main_tex} --registry ${C.registry} --original ${C.orig_tex} --json
${R}/bin/paperloop-aitells ${C.main_tex} --baseline .paperloop/snapshots/${tag}-before/files/${C.main_tex.replace(C.paper_dir.replace(/\/$/, '') + '/', '')} --json
pass = all three exit 0 (for paperloop-numbers, NOTHING_FOUND counts as a failure; paperloop-aitells fails if this iteration's edits made the paper read more machine-written than it did before the iteration — name it check "machine-prose" and copy its fail reason and top examples). Put validate's main_text_words in words. In each failing check's detail, copy the failing lines verbatim (unmatched numbers with context).`
  let chk = edits.edits.length ? await agent(checkPrompt, { label: `check-${tag}`, phase: 'Check', schema: CHECKS, model: 'sonnet', effort: 'low' }) : { pass: true, checks: [] }
  let repaired = false
  if (chk && !chk.pass) {
    repaired = true
    await agent(
      `Read ${R}/agents/reviser.md (ignore its YAML header). Your earlier edits to ${C.main_tex} broke these hard checks:
${JSON.stringify(chk.checks.filter(c => !c.pass), null, 1)}
Fix ONLY what your edits broke (or undo those edits). Do not change any number. The original is ${C.orig_tex}. ${BLIND} Return the same JSON shape, listing the edits that remain.`,
      { label: `repair-${tag}`, phase: 'Check', schema: EDITS })
    chk = await agent(checkPrompt, { label: `recheck-${tag}`, phase: 'Check', schema: CHECKS, model: 'sonnet', effort: 'low' })
  }

  let reverted = false, revertReason = ''
  if (!chk || !chk.pass) {
    reverted = true; revertReason = 'hard checks failed after one repair'
  } else if (edits.edits.length) {
    const before = `.paperloop/snapshots/${tag}-before/files/${C.main_tex.replace(C.paper_dir.replace(/\/$/, '') + '/', '')}`
    const sections = [...new Set(edits.edits.map(e => e.section))].join(', ')
    const judgeP = (x, y) => `Read ${R}/agents/judge.md (ignore its YAML header) and follow it, field: ${C.field}. Compare ONLY these sections: ${sections}. Version X is the LaTeX file ${x}. Version Y is the LaTeX file ${y}. Read nothing else. ${BLIND}`
    const tasks = [
      () => agent(judgeP(before, C.main_tex), { label: `judge-${tag}-BA`, phase: 'Check', schema: VERDICT, model: 'sonnet' }),
      () => agent(judgeP(C.main_tex, before), { label: `judge-${tag}-AB`, phase: 'Check', schema: VERDICT, model: 'sonnet' }),
    ]
    if (C.xreview_cmd) tasks.push(() => agent(
      `Run cross-family judges (non-Claude models) both orders from the project root:
${C.xreview_cmd} judge ${before} ${C.main_tex} --diff-only --out .paperloop/iters/${tag}/xjudge_BA --field "${C.field}"
${C.xreview_cmd} judge ${C.main_tex} ${before} --diff-only --out .paperloop/iters/${tag}/xjudge_AB --field "${C.field}"
Each writes one JSON per model with "winner" X|Y|tie. In run BA, X=before; in run AB, X=after. For each model: prefers=before if it picked before in both runs, after if after in both, tie otherwise, error if a file is missing or unparsed. Never print API keys.`,
      { label: `xjudge-${tag}`, phase: 'Check', schema: XVERDICT, model: 'sonnet', effort: 'low' }))
    const [ba, ab, xj] = await parallel(tasks)
    const claudeBefore = ba && ab && ba.winner === 'X' && ab.winner === 'Y'
    const claudeAfter = ba && ab && ba.winner === 'Y' && ab.winner === 'X'
    const xv = (xj && xj.votes) || []
    const xBefore = xv.filter(v => v.prefers === 'before').length, xAfter = xv.filter(v => v.prefers === 'after').length
    events.push({ event: 'judge', k, unit: sections, order: 'before-after', verdict: ba ? ba.winner : 'none', family: 'claude' })
    events.push({ event: 'judge', k, unit: sections, order: 'after-before', verdict: ab ? ab.winner : 'none', family: 'claude' })
    xv.forEach(v => events.push({ event: 'judge', k, unit: sections, order: 'both', verdict: v.prefers, family: v.model }))
    if (claudeBefore || (xv.length && xBefore > xAfter && !claudeAfter)) {
      reverted = true
      revertReason = claudeBefore ? 'Claude judges preferred the previous version in both orders' : `cross-family judges preferred the previous version (${xBefore} vs ${xAfter})`
    }
    log(`${tag}: claude ${ba && ba.winner}/${ab && ab.winner}, xfamily before=${xBefore} after=${xAfter}`)
  }

  if (reverted) {
    await agent(`From the project root run: ${R}/bin/paperloop-snapshot restore ${C.paper_dir} ${tag}-before --root .paperloop  and return ok=true only if it prints byte-identical.`,
      { label: `revert-${tag}`, phase: 'Check', schema: DONE, model: 'sonnet', effort: 'low' })
    log(`${tag}: REVERTED — ${revertReason}`)
  }

  // ---------- resolution + log ----------
  phase('Log')
  let resolved = { results: [] }
  if (fixable.length && !reverted) {
    const before = `.paperloop/snapshots/${tag}-before/files/${C.main_tex.replace(C.paper_dir.replace(/\/$/, '') + '/', '')}`
    resolved = (await agent(
      `For each complaint below, compare the passage in the previous version (${before}) with the current version (${C.main_tex}) and decide whether the complaint is resolved, partial, no (still applies), or not_attempted. Quote the new text as evidence. Judge only whether THIS complaint is answered. ${BLIND}
${JSON.stringify(fixable.map(f => ({ cid: f.cid, section: f.section, quote: f.quote, problem: f.problem })), null, 1)}`,
      { label: `resolve-${tag}`, phase: 'Log', schema: RESOLVED, model: 'sonnet' })) || resolved
  }
  const resOf = Object.fromEntries(resolved.results.map(r => [r.cid, r.resolution]))
  allCids.forEach(cid => {
    const c = byCid[cid] || {}
    const fl = finalLabel(cid)
    events.push({ event: 'complaint', cid, k, persona_id: persona, section: c.section || 'global', quote: (c.quote || '').slice(0, 300),
      severity: c.severity || null, label_triager1: ((lab[0] || {})[cid] || []).join('+') || null, label_triager2: ((lab[1] || {})[cid] || []).join('+') || null, final_label: fl,
      revised: agreedFix(cid).length > 0, resolution: reverted ? 'not_attempted' : (resOf[cid] || 'not_attempted') })
  })
  edits.edits.forEach(e => events.push({ event: 'edit', eid: e.eid, cid: e.cid, section: e.section, numbers_changed: !!e.numbers_changed, claim_narrowed: !!e.claim_narrowed, kept: !reverted }))
  ;((chk && chk.checks) || []).forEach(c => events.push({ event: 'check', k, name: c.name, pass: c.pass, detail: (c.detail || '').slice(0, 300) }))
  events.push({ event: 'iteration', k, persona_id: persona, accepted_edits: reverted ? 0 : edits.edits.length, reverted, revert_reason: revertReason, repaired, words: chk && chk.words })
  const stamped = events.map(e => ({ run_id: C.run_id, paper_id: C.paper_id, ...e }))
  await agent(
    `Write this JSON array exactly as given to .paperloop/iters/${tag}/events.json, then run from the project root: ${R}/bin/paperloop-log batch @.paperloop/iters/${tag}/events.json --log .paperloop/runs.jsonl
Also run: ${R}/bin/paperloop-snapshot save ${C.paper_dir} ${tag}-after --root .paperloop
Return ok=true if both succeeded.
${JSON.stringify(stamped)}`,
    { label: `log-${tag}`, phase: 'Log', schema: DONE, model: 'sonnet', effort: 'low' })

  summary.push({ k, persona, complaints: complaints.length, fixable: fixable.length, edits: edits.edits.length, reverted, revertReason,
    resolved: resolved.results.filter(r => r.resolution === 'resolved').length })
}

phase('Log')
await agent(
  `Append one line to PROJECT-LOG.jsonl at the project root (create it if missing): {"ts": "<date -u +%FT%TZ>", "type": "paper", "text": "paperloop improve-loop ${C.run_id} finished: ${summary.length} iterations, ${summary.filter(s => s.reverted).length} reverted, ${summary.reduce((a, s) => a + (s.reverted ? 0 : s.edits), 0)} edits kept", "refs": [".paperloop/runs.jsonl", ".paperloop/snapshots/"], "by": "agent"}
Then run ${R}/bin/paperloop-snapshot save ${C.paper_dir} final-${C.run_id} --root .paperloop. Return ok.`,
  { label: 'finish', phase: 'Log', schema: DONE, model: 'sonnet', effort: 'low' })

return { ok: true, run_id: C.run_id, iterations: summary }
