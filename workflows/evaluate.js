export const meta = {
  name: 'evaluate',
  description: 'paperloop final evaluation: original vs final paper, blind, both orders, per section and whole paper, held-out reviews (Claude + optional other model families), judge sanity controls, optional mapping of official reviews',
  whenToUse: 'After /paperloop:improve, to measure whether the final paper communicates better than the original. Packaging only - more-experiments complaints are excluded from the score.',
  phases: [
    { title: 'Prepare', detail: 'compile both versions + two control variants' },
    { title: 'Judge', detail: 'per-section and whole-paper side by side, both orders' },
    { title: 'Review', detail: 'held-out blind reviews of both versions' },
    { title: 'Machine prose', detail: 'tell counts + meta-judge (Claude and non-Claude) on both versions' },
    { title: 'Official', detail: 'map official review complaints (only if given)' },
    { title: 'Report', detail: 'apply pass criteria, write report, log' },
  ],
}

// args (optional): { tag, original_tex, final_tex, official_reviews }  — paths relative to project root
const A = args || {}
const TAG = A.tag || 'final'

const PREP = {
  type: 'object', required: ['ok', 'root', 'field', 'venue', 'scale', 'orig_tex', 'final_tex', 'orig_pdf', 'final_pdf', 'padded_tex', 'wrongnum_tex', 'sections', 'xreview_cmd', 'hard'],
  properties: {
    ok: { type: 'boolean' }, error: { type: 'string' }, root: { type: 'string' }, field: { type: 'string' }, venue: { type: 'string' }, scale: { type: 'string' },
    orig_tex: { type: 'string' }, final_tex: { type: 'string' }, orig_pdf: { type: 'string' }, final_pdf: { type: 'string' },
    padded_tex: { type: 'string' }, wrongnum_tex: { type: 'string' }, planted: { type: 'string' },
    sections: { type: 'array', items: { type: 'string' } }, xreview_cmd: { type: 'string' }, paper_id: { type: 'string' }, run_id: { type: 'string' }, length_tolerance: { type: 'number' },
    hard: { type: 'object', properties: { orig_compiles: { type: 'boolean' }, final_compiles: { type: 'boolean' }, numbers_locked: { type: 'boolean' }, citations_ok: { type: 'boolean' }, length_ratio: { type: 'number' }, details: { type: 'string' } } },
  },
}
const VERDICT = { type: 'object', required: ['winner'], properties: { winner: { type: 'string', enum: ['X', 'Y', 'tie'] }, confidence: { type: 'number' }, reasons: { type: 'array', items: { type: 'string' } } } }
const REVIEW = {
  type: 'object', required: ['overall', 'presentation', 'complaints'],
  properties: { overall: { type: 'number' }, presentation: { type: 'number' }, path: { type: 'string' },
    complaints: { type: 'array', items: { type: 'object', required: ['text', 'label'], properties: { text: { type: 'string' }, label: { type: 'string', enum: ['presentation', 'claim_scope', 'literature', 'execution', 'significance'] } } } } },
}
const XREV = { type: 'object', required: ['reviews'], properties: { reviews: { type: 'array', items: { type: 'object', required: ['model', 'version', 'presentation_complaints'], properties: { model: { type: 'string' }, version: { type: 'string' }, overall: { type: 'number' }, presentation: { type: 'number' }, presentation_complaints: { type: 'number' }, total_complaints: { type: 'number' } } } } } }
const XJ = { type: 'object', required: ['votes'], properties: { votes: { type: 'array', items: { type: 'object', required: ['model', 'prefers'], properties: { model: { type: 'string' }, prefers: { type: 'string', enum: ['original', 'final', 'tie', 'error'] } } } } } }
const CLAIMS = { type: 'object', required: ['stronger_in_final'], properties: { stronger_in_final: { type: 'array', items: { type: 'object', required: ['is_stronger'], properties: { quote_original: { type: 'string' }, quote_final: { type: 'string' }, is_stronger: { type: 'boolean' }, why: { type: 'string' } } } } } }
const OFFICIAL = {
  type: 'object', required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', required: ['reviewer', 'complaint', 'kind', 'status_P', 'status_Q'],
    properties: { reviewer: { type: 'string' }, complaint: { type: 'string' }, kind: { type: 'string', enum: ['presentation', 'not_presentation'] },
      status_P: { type: 'string', enum: ['resolved', 'partial', 'unresolved', 'already_fine', 'n/a'] }, status_Q: { type: 'string', enum: ['resolved', 'partial', 'unresolved', 'already_fine', 'n/a'] },
      evidence_P: { type: 'string' }, evidence_Q: { type: 'string' } } } } },
}
const AIP = { type: 'object', required: ['overall', 'verdict'], properties: { overall: { type: 'number' }, verdict: { type: 'string' }, worst: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, tell: { type: 'string' } } } } } }
const TELLS = { type: 'object', required: ['orig_score', 'final_score'], properties: { orig_score: { type: 'number' }, final_score: { type: 'number' }, xfamily: { type: 'array', items: { type: 'object', properties: { model: { type: 'string' }, version: { type: 'string' }, overall: { type: 'number' } } } } } }
const DONE = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string' } } }

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

phase('Prepare')
const P = await agent(
  `You prepare a blind evaluation of two versions of one paper. Project root = current directory. E = .paperloop/eval/${TAG}.
1. Read .paperloop/config.json and .paperloop/state.json. root = config.plugin_root, copied verbatim (it is the plugin's install directory, NOT the project directory); check root/bin/paperloop-validate exists. Original main tex = ${A.original_tex ? `"${A.original_tex}"` : 'state.orig_tex'}; final main tex = ${A.final_tex ? `"${A.final_tex}"` : 'config.main_tex'}.
2. Copy the original's whole directory to E/orig/ and the final's whole directory to E/final/ (cp -r). Rename each main file to paper.tex. Strip any version/draft markers from \\title or comments that would reveal which is which (do NOT change other content). Compile each with root/bin/paperloop-validate E/<v>/paper.tex --compile --json. orig_pdf/final_pdf = the PDFs.
3. Hard checks: run root/bin/paperloop-numbers E/final/paper.tex --registry <config.registry> --original E/orig/paper.tex --json  (numbers_locked = status PASS); citations_ok = validate's citations and undefined-refs checks pass for final; length_ratio = final main_text_words / original main_text_words. Put short notes in details.
4. Controls (judge sanity):
   - padded: copy E/orig to E/padded; in E/padded/paper.tex add roughly 30% more words of plausible but content-free elaboration spread over the introduction, method and discussion (restatements, generic motivation). Do not change numbers or claims. Compile.
   - wrongnum: copy E/orig to E/wrongnum; change ONE headline result number in the abstract to a wrong value (keep the table unchanged, so the paper is now inconsistent), and polish the prose of that abstract paragraph so it reads better. Compile. Say what you changed in "planted".
5. sections: list the paper's top-level \\section titles that exist in both versions, plus "abstract" and "figures-and-tables" (max 9).
6. xreview_cmd: if config.xreview.enabled, "root/bin/paperloop-xreview" + " --env-file ENV" if set + " --models M" if set + " --allow-paid --max-usd X" only if allowed; else "".
7. field, venue, scale, paper_id, length_tolerance (default 0.10) from config; run_id = "eval-" + \`date -u +%Y%m%dT%H%M%SZ\`.
Paths you return are relative to the project root. ok=false with error if either version fails to compile.`,
  { label: 'prepare', phase: 'Prepare', schema: PREP, model: 'sonnet' })
if (!P || !P.ok) return { ok: false, error: P ? P.error : 'prepare failed' }
const R = await pluginRoot('Prepare')
if (!R) return { ok: false, error: 'could not resolve the plugin root (config.plugin_root)' }
const E = `.paperloop/eval/${TAG}`
const BLIND = 'Read only the files named here. Do not read anything else under .paperloop/, do not read logs or reviews, and do not search the web for this paper.'
const judge = (x, y, scope) => `Read ${R}/agents/judge.md (ignore its YAML header) and follow it, field: ${P.field}. ${scope} Version X is ${x}. Version Y is ${y}. ${BLIND}`

// both orders; returns 'original' | 'final' | 'tie'
async function pair(label, a, b, scope, aName, bName) {
  const [r1, r2] = await parallel([
    () => agent(judge(a, b, scope), { label: `${label}-1`, phase: 'Judge', schema: VERDICT, model: 'sonnet' }),
    () => agent(judge(b, a, scope), { label: `${label}-2`, phase: 'Judge', schema: VERDICT, model: 'sonnet' }),
  ])
  if (!r1 || !r2) return 'missing'
  if (r1.winner === 'X' && r2.winner === 'Y') return aName
  if (r1.winner === 'Y' && r2.winner === 'X') return bName
  return 'tie'
}

phase('Judge')
const O = `${E}/orig/paper.tex`, F = `${E}/final/paper.tex`
const sectionVerdicts = await pipeline(P.sections, s =>
  pair(`sec-${s}`.slice(0, 40), O, F, `Compare ONLY the part "${s}" of each version.`, 'original', 'final').then(v => ({ section: s, verdict: v })))
const [whole, padCtl, wrongCtl] = await parallel([
  () => pair('whole', O, F, 'Compare the whole main text.', 'original', 'final'),
  () => pair('control-padded', O, P.padded_tex, 'Compare the whole main text.', 'original', 'padded'),
  () => pair('control-wrongnum', O, P.wrongnum_tex, 'Compare the whole main text, including whether numbers agree between abstract, text and tables.', 'original', 'wrongnum'),
])
let xj = null
if (P.xreview_cmd) {
  xj = await agent(
    `Run non-Claude judges on the whole paper, both orders, from the project root:
${P.xreview_cmd} judge ${P.orig_pdf} ${P.final_pdf} --out ${E}/xjudge_OF --field "${P.field}"
${P.xreview_cmd} judge ${P.final_pdf} ${P.orig_pdf} --out ${E}/xjudge_FO --field "${P.field}"
In OF, X=original; in FO, X=final. Per model: prefers=original if original won both, final if final won both, tie otherwise, error if missing/unparsed. Never print keys.`,
    { label: 'xjudge-whole', phase: 'Judge', schema: XJ, model: 'sonnet', effort: 'low' })
}
const claimAudit = await agent(
  `List every claim sentence in the FINAL version (${F}) that is stronger than the corresponding claim in the ORIGINAL (${O}): broader scope, more certainty, fewer qualifiers, a new causal claim. Quote both. An empty list is the expected answer if the revision only narrowed or clarified. List ONLY claims that are stronger, with is_stronger=true; never list a claim to say it is not stronger. ${BLIND}`,
  { label: 'claim-strength', phase: 'Judge', schema: CLAIMS, model: 'sonnet' })

phase('Review')
const revTask = (pdf, version, i) => () => agent(
  `Read ${R}/agents/blind-reviewer.md (ignore its YAML header) and follow it with VENUE="${P.venue}", FIELD="${P.field}", SCALE="${P.scale}". The PDF is ${pdf}. Write your review to ${E}/reviews/${version}_claude_${i}.md. Then, as your returned data, give the Overall and Presentation scores and every weakness as one complaint, each labelled presentation / claim_scope / literature / execution / significance using the definitions in ${R}/agents/triager.md. ${BLIND}`,
  { label: `review-${version}-${i}`, phase: 'Review', schema: REVIEW, model: 'sonnet' })
// Fixed counterbalance (no randomness available): reviewers see the versions under neutral filenames.
const reviews = await parallel([revTask(P.orig_pdf, 'v1', 1), revTask(P.final_pdf, 'v2', 1), revTask(P.final_pdf, 'v2', 2), revTask(P.orig_pdf, 'v1', 2)])
let xr = null
if (P.xreview_cmd) {
  xr = await agent(
    `Run non-Claude blind reviews of both versions from the project root:
${P.xreview_cmd} review ${P.orig_pdf} --out ${E}/xreviews/v1 --venue "${P.venue}" --field "${P.field}" --scale "${P.scale}"
${P.xreview_cmd} review ${P.final_pdf} --out ${E}/xreviews/v2 --venue "${P.venue}" --field "${P.field}" --scale "${P.scale}"
Then read each produced review. For each (model, version) report Overall and Presentation scores if given, the total number of weaknesses, and how many are presentation (fixable by words alone, per ${R}/agents/triager.md). version = "original" for v1, "final" for v2. Never print keys.`,
    { label: 'xreviews', phase: 'Review', schema: XREV, model: 'sonnet' })
}

phase('Machine prose')
const aipTask = (tex, version) => () => agent(
  `Read ${R}/agents/ai-prose-judge.md (ignore its YAML header) and follow it, field: ${P.field}. First run ${R}/bin/paperloop-aitells ${tex} --json for counts. Then read ${tex} (and its \\input files). Return overall (1-5), verdict, and your 5 worst passages as worst [{quote, tell}]. ${BLIND}`,
  { label: `aiprose-${version}`, phase: 'Machine prose', schema: AIP, model: 'sonnet' })
const [aipO, aipF, tells] = await parallel([aipTask(O, 'v1'), aipTask(F, 'v2'), () => agent(
  `From the project root run ${R}/bin/paperloop-aitells ${O} --json and ${R}/bin/paperloop-aitells ${F} --json; return orig_score and final_score.${P.xreview_cmd ? ` Then run non-Claude machine-prose judges: ${P.xreview_cmd} aiprose ${O} --out ${E}/xaiprose/original --field "${P.field}" and ${P.xreview_cmd} aiprose ${F} --out ${E}/xaiprose/final --field "${P.field}"; for each JSON written report {model, version: original|final, overall}. Never print keys.` : ''}`,
  { label: 'aitells', phase: 'Machine prose', schema: TELLS, model: 'sonnet', effort: 'low' })])

let official = null
if (A.official_reviews) {
  phase('Official')
  official = await agent(
    `You are given, for the first time, the official reviews of a submitted paper: ${A.official_reviews}. Two versions of the paper follow, labelled P (${P.final_pdf}) and Q (${P.orig_pdf}); you are not told which came first. For EACH distinct complaint in the official reviews: kind = presentation if it could be fixed by wording, structure, definitions, captions or citing existing facts; otherwise not_presentation (needs new experiments, analyses, a different design, or is about significance). For presentation complaints give status in P and in Q: resolved, partial, unresolved, or already_fine; quote the passage as evidence. For not_presentation use n/a. Read only those three files.`,
    { label: 'official-mapping', phase: 'Official', schema: OFFICIAL, model: 'sonnet' })
}

phase('Report')
const count = v => sectionVerdicts.filter(s => s && s.verdict === v).length
const presOf = r => (r && r.complaints ? r.complaints.filter(c => c.label === 'presentation').length : null)
const [o1, f1, f2, o2] = reviews
const avg = xs => { const v = xs.filter(x => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const presO = avg([presOf(o1), presOf(o2)]), presF = avg([presOf(f1), presOf(f2)])
const noise = Math.max(Math.abs((presOf(o1) || 0) - (presOf(o2) || 0)), Math.abs((presOf(f1) || 0) - (presOf(f2) || 0)))
const presScoreO = avg([o1 && o1.presentation, o2 && o2.presentation]), presScoreF = avg([f1 && f1.presentation, f2 && f2.presentation])
const offPres = official ? official.items.filter(i => i.kind === 'presentation') : []
const offFixed = offPres.filter(i => ['resolved', 'partial'].includes(i.status_P) && !['resolved', 'already_fine'].includes(i.status_Q)).length
const offRegress = offPres.filter(i => i.status_Q === 'already_fine' && i.status_P === 'unresolved').length

const controlsOk = padCtl !== 'padded' && wrongCtl !== 'wrongnum'
const h = P.hard
const hardOk = h.orig_compiles && h.final_compiles && h.numbers_locked && h.citations_ok && Math.abs(h.length_ratio - 1) <= (P.length_tolerance || 0.10) + 1e-9 && (claimAudit ? claimAudit.stronger_in_final.filter(c => c.is_stronger).length === 0 : false)
const secOk = count('final') >= 4 && count('original') <= 1
const wholeOk = whole === 'final' || (xj && xj.votes.some(v => v.prefers === 'final') && !xj.votes.some(v => v.prefers === 'original') && whole !== 'original')
const reviewOk = (presO !== null && presF !== null && presF <= 0.7 * presO && (presO - presF) > noise && (presScoreF || 0) >= (presScoreO || 0))
  || (offPres.length > 0 && offFixed >= 0.5 * offPres.length && offRegress === 0)
const xa = (tells && tells.xfamily) || []
const xaO = avg(xa.filter(x => x.version === 'original').map(x => x.overall)), xaF = avg(xa.filter(x => x.version === 'final').map(x => x.overall))
// the non-Claude meta-judge is reported only: a free model rated a human-written paper (MMLU) more machine-like
// than an LLM-written draft, so it does not decide anything until a model that separates them is found.
const proseOk = !!(tells && tells.final_score <= tells.orig_score + 0.5 && aipO && aipF && aipF.overall <= aipO.overall)
const verdict = !controlsOk ? 'JUDGE_UNTRUSTED' : (hardOk && secOk && wholeOk && reviewOk && proseOk ? 'PASS' : 'FAIL')

const result = {
  verdict, tag: TAG,
  hard: { ...h, stronger_claims: claimAudit ? claimAudit.stronger_in_final.filter(c => c.is_stronger) : null, pass: hardOk },
  controls: { padded: padCtl, wrongnum: wrongCtl, planted: P.planted, pass: controlsOk },
  sections: { verdicts: sectionVerdicts, final_wins: count('final'), original_wins: count('original'), ties: count('tie'), pass: secOk },
  whole_paper: { claude: whole, xfamily: xj ? xj.votes : null, pass: !!wholeOk },
  heldout_reviews: { claude: { original: [o1, o2].map(r => r && { overall: r.overall, presentation: r.presentation, presentation_complaints: presOf(r), total: r.complaints.length }), final: [f1, f2].map(r => r && { overall: r.overall, presentation: r.presentation, presentation_complaints: presOf(r), total: r.complaints.length }), noise_floor: noise }, xfamily: xr ? xr.reviews : null, pass: !!reviewOk },
  machine_prose: { tell_score: tells ? { original: tells.orig_score, final: tells.final_score } : null, claude_meta_judge: { original: aipO, final: aipF }, xfamily_meta_judge: { original: xaO, final: xaF, decides: false }, pass: proseOk,
    note: 'Lower is better. 1 = reads human, 5 = obviously model-written. The final must not read more machine-written than the original.' },
  official: official ? { presentation_items: offPres.length, fixed_in_final: offFixed, regressions: offRegress, not_presentation: official.items.length - offPres.length, items: official.items } : null,
  caveats: ['All Claude judges share a model family with the reviser; self-preference is not removed. Cross-family results, if present, are the check on that.', 'One paper is one data point about the loop.', 'Thresholds are unvalidated design choices.'],
}
await agent(
  `Write ${E}/result.json with exactly this JSON, and ${E}/REPORT.md: a plain-language report for the paper's owner. Lead with the verdict and what it means in one sentence; then a table per signal (hard checks, controls, per-section verdicts, whole-paper, held-out reviews with model family named, machine-prose scores, official-review mapping if present); then the caveats. Numbers verbatim from the JSON. Then append to .paperloop/runs.jsonl via: ${R}/bin/paperloop-log final_eval '{"run_id":"${P.run_id}","paper_id":"${P.paper_id}","verdict":"${verdict}","ref":"${E}/result.json"}' --log .paperloop/runs.jsonl  and add a "paper" event line to PROJECT-LOG.jsonl with the verdict and refs.
${JSON.stringify(result)}`,
  { label: 'report', phase: 'Report', schema: DONE, model: 'sonnet' })
return result
