export const meta = {
  name: 'qlip-world-variants',
  description: 'Add work-world and school-world cards per domain so the audience-learning feed has something to serve each player',
  phases: [{ title: 'Author', detail: 'one author per domain' }],
}
const ROOT = '/Users/sergiuman/Desktop/Gemini/Qumni Framework/qlip'
const DOMAINS = ['action','perception','thinking','systems','habits','emotions','meaning','growth','connection','attention','decisions','wisdom']
const OUT = { type: 'object', properties: { domain: { type: 'string' }, new_card_ids: { type: 'array', items: { type: 'string' } }, validator_errors: { type: 'number' } }, required: ['domain','new_card_ids','validator_errors'] }
const res = await parallel(DOMAINS.map(d => () => agent(`You write Qlip cards for domain "${d}". Edit ONLY ${ROOT}/content/cards/${d}.json (append).
Context: Qlip's feed now learns which life-world each player relates to (school/young, work, everyday) from what they play or skip. The QA panel showed a 44-year-old manager feels excluded by school scenarios and a 16-year-old by office ones. So we need cards that live FULLY in one world.
Read: ${ROOT}/docs/CARD_SCHEMA.md, ${ROOT}/content/lessons.json (obey; the latest lesson says one world per card is now fine), ${ROOT}/content/concepts.json, and the existing cards in your file (avoid repeating their stories/studies; grep ${ROOT}/content/cards/ before using a study).
Write 3 NEW cards for the 3 most-linked concepts in your domain (count links to/from each concept in concepts.json):
- 2 WORK-world cards: every scenario at work (managers, teams, 1:1s, stand-ups, deadlines, clients, career moves). Practical tools a tired manager can use tomorrow; try_team is a concrete 5-minute team exercise.
- 1 SCHOOL/YOUNG-world card: every scenario in a 13–18-year-old's life (school, mates, group chats, revision, sport, part-time job, family). Surprising, fast, never preachy.
Each: a different game type from the concept's existing cards where possible, verdict-first, honest science (disputed = "contested"), insight ≤200 chars, kind feedback, "sensitive": true for mood/self-worth. Then review your own cards as a research psychologist and as an anxious 24-year-old, fix, and run python3 ${ROOT}/pipeline/validate.py ${ROOT}/content/cards/${d}.json until 0 errors.`, { label: `worlds:${d}`, phase: 'Author', schema: OUT })))
return res.filter(Boolean)