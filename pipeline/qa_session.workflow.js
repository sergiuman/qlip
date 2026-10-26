export const meta = {
  name: 'qlip-qa-session',
  description: 'One Qlip QA session: 6 persona agents score the experience, then domain fixers apply content fixes',
  phases: [{ title: 'Panel', detail: '6 personas play-review a sample' }, { title: 'Fix', detail: 'one fixer per affected domain file' }],
}
const ROOT = '/Users/sergiuman/Desktop/Gemini/Qumni Framework/qlip'
const N = args.session
const PERSONAS = [
  { key: 'teen', who: 'Maya, 16, high-school student in Manchester. Lives on TikTok, allergic to anything that feels like school or a lecture. Will only stay if it is fast, surprising and about her.' },
  { key: 'manager', who: 'Radu, 44, engineering manager in Cluj, non-native English speaker, tired and a bit burned out. Wants practical tools he can use tomorrow with his team and himself; impatient with fluff.' },
  { key: 'philosopher', who: 'Elena, 68, retired literature teacher who reads Seneca, Aristotle and Peterson. Values depth, accuracy and respect for the reader; dislikes pop-psych oversimplification.' },
  { key: 'anxious', who: 'Sam, 24, graduate dealing with anxiety and low self-worth after a rough year. Sensitive to anything that shames, labels or pressures. Needs the experience to feel safe and genuinely helpful.' },
  { key: 'psychologist', who: 'Dr. Okafor, 51, research psychologist. Checks every claim, attribution and effect size; hunts for replication-crisis myths, overclaiming, and bad survey design in the games (leading or ambiguous items, inverted items that do not invert, results that do not follow from answers).' },
  { key: 'designer', who: 'Lina, 31, product designer specialising in mobile games and learning apps. Judges hook strength, pacing, game feel, clarity of what to tap, reward moments, and whether people would share it.' },
]
const SCORE = { type: 'object', properties: {
  persona: { type: 'string' },
  scores: { type: 'object', properties: { hook: { type: 'number' }, clarity: { type: 'number' }, usefulness: { type: 'number' }, safety: { type: 'number' }, fun: { type: 'number' } }, required: ['hook','clarity','usefulness','safety','fun'] },
  issues: { type: 'array', items: { type: 'object', properties: { card_id: { type: 'string' }, severity: { type: 'string', enum: ['high','medium','low'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['card_id','severity','problem','fix'] } },
  best_cards: { type: 'array', items: { type: 'string' } },
  verdict: { type: 'string' },
}, required: ['persona','scores','issues','best_cards','verdict'] }

const panelPrompt = p => `You are QA reviewer "${p.key}" for Qlip (QA session ${N}). Stay fully in character: ${p.who}
Qlip is a TikTok-style feed of 30-second games teaching practical philosophy & psychology models ("alternative psychology"; aim: a practical, playful Peterson Academy that always leaves the player better off, never harmed).
Look at:
- the cards in this session's sample: ids listed in ${ROOT}/qa/sessions/sample-${N}.txt; read their full JSON from ${ROOT}/data/qlip.json (array "cards"). Card format: ${ROOT}/docs/CARD_SCHEMA.md.
- screenshots of those cards being played on a phone in ${ROOT}/qa/screens/s${N}/ (<id>-a.png = top, <id>-b.png = scrolled to the reveal) plus view-*.png for Tracks/Map/Feed in dark and light. Look at at least 8 screenshots.
- the app code ${ROOT}/app.js only if you need to understand a behaviour.
Score the experience 1–10 on each dimension FROM YOUR PERSONA'S POINT OF VIEW, honestly and strictly (7 = good, 9+ = exceptional; do not inflate): hook (would I stop scrolling), clarity (do I understand what to do and what it means), usefulness (did it develop me / give me something I can use), safety (kind, non-shaming, accurate, responsible), fun (would I play the next one / share it).
List up to 8 concrete issues, most important first. card_id = a card id, or "app" for interface/feed-level problems. Each fix must be specific enough for an editor to apply directly (rewrite text, change option values, etc.). best_cards = up to 3 ids you liked most. Do not edit any files.`

const FIX = { type: 'object', properties: { domain: { type: 'string' }, applied: { type: 'number' }, skipped: { type: 'array', items: { type: 'string' } }, validator_errors: { type: 'number' } }, required: ['domain','applied','skipped','validator_errors'] }

const FACT = { type: 'object', properties: { issues: SCORE.properties.issues, checked: { type: 'number' } }, required: ['issues','checked'] }
const factPrompt = `You are the fact-checker for Qlip QA session ${N}. In ${ROOT}/data/qlip.json, check EVERY card that has "from_source" (quote, cite, next_read), plus every estimate card's "answer" and "explain" numbers, and every card marked evidence "strong". Use WebSearch/WebFetch to verify exact quote wording against a public-domain translation, the attribution, the chapter, and the numbers/studies. Report ONLY real problems (misquote, wrong chapter, wrong number, misattribution, overclaim) as issues with card_id and an exact replacement in "fix" (or "remove from_source" if it can't be verified). Do not edit files.`
phase('Panel')
const [panelRaw, fact] = await Promise.all([
  parallel(PERSONAS.map(p => () => agent(panelPrompt(p), { label: `persona:${p.key}`, phase: 'Panel', schema: SCORE }))),
  agent(factPrompt, { label: 'fact-check', phase: 'Panel', schema: FACT }),
])
const panel = panelRaw.filter(Boolean)

// group card-level issues by domain file (card id -> domain via a lookup the fixer does itself)
const cardIssues = panel.flatMap(r => r.issues.filter(i => i.card_id !== 'app').map(i => ({ ...i, from: r.persona })))
  .concat((fact?.issues || []).map(i => ({ ...i, from: 'fact-check (verified online; apply exactly)' })))
const appIssues = panel.flatMap(r => r.issues.filter(i => i.card_id === 'app').map(i => ({ ...i, from: r.persona })))
const DOMAINS = ['action','perception','thinking','systems','habits','emotions','meaning','growth','connection','attention','decisions','wisdom']
phase('Fix')
const fixes = await parallel(DOMAINS.map(d => () => agent(`You are a Qlip content editor fixing QA findings from session ${N}. Edit ONLY ${ROOT}/content/cards/${d}.json (schema: ${ROOT}/docs/CARD_SCHEMA.md; graph: ${ROOT}/content/concepts.json).
Here are ALL card-level issues from the persona panel (JSON). Apply only those whose card_id is a card in YOUR file (check ids in the file); ignore the rest. If an issue's card is in your file, apply the fix faithfully unless it would introduce a factual error or harm — then do the closest safe version. Also apply the same kind of improvement to sibling cards in your file when the issue is clearly a pattern (e.g. hook repeats the question, inverted item misphrased).
ISSUES:
${JSON.stringify(cardIssues)}
ALSO, in your file: (1) shorten any "insight" longer than 200 characters to at most 200 (keep evidence caveats); (2) any card whose id is listed in ${ROOT}/data/needs_review.json was machine-generated by a small local model: bring it fully up to house standard per ${ROOT}/docs/CARD_SCHEMA.md and ${ROOT}/content/lessons.json (accuracy, a scenario that fits teens AND adults, verdict-first, kind, try_team), or delete it if it can't be made good.
After editing run: python3 ${ROOT}/pipeline/validate.py ${ROOT}/content/cards/${d}.json until 0 errors. Count every change in applied.`, { label: `fix:${d}`, phase: 'Fix', schema: FIX })))
return { session: N, panel, appIssues, fact, fixes: fixes.filter(Boolean) }