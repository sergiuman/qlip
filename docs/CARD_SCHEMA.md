# Qlip card schema (v1)

A **qlip** is a 20–60 second interactive card: a hook that stops the scroll, a tiny
game that puts *the player* inside the idea, a reveal that names the model, and
one thing to try today. Every card belongs to exactly one concept node in
`content/concepts.json`.

Cards live in `content/cards/<domain>.json` as a JSON array.

## Common fields (all required unless marked optional)

| field | rules |
|---|---|
| `id` | kebab-case, unique, prefixed by concept: `wso-triad-venn` |
| `concept` | a concept id from concepts.json |
| `domain` | that concept's domain id |
| `type` | one of `venn`, `spectrum`, `radar`, `swipe`, `choice`, `order`, `estimate`, `reveal` |
| `hook` | ≤ 70 chars. A question or provocation in second person. No clickbait lies. |
| `title` | ≤ 40 chars. Name of the idea in plain words. |
| `game` | type-specific object, see below |
| `insight` | 2–3 short sentences (≤ 320 chars). What the game just showed you. Plain language, grade-8 reading level. |
| `model` | ≤ 110 chars. The mental model in one line — the thing worth remembering. |
| `try_today` | ≤ 140 chars. Starts with a verb. Concrete, safe, doable in < 10 minutes. |
| `source` | `{ "thinkers": [..], "work": "Book or paper (year)" }` — real, correctly attributed. |
| `evidence` | `strong` (replicated science) · `moderate` (good evidence, some debate) · `contested` (popular but disputed — say so in insight) · `philosophy` (a lens, not an empirical claim) |
| `level` | 1 = anyone, 2 = some background, 3 = deep |
| `related` | 1–3 other concept ids this card should lead to |
| `try_team` | optional, ≤ 160 chars: the same idea as a 5-minute exercise for a team, class or family |
| `from_source` | optional `{ "quote": "≤ 25 words, public-domain text or a short fair-use phrase", "cite": "Author, Work, chapter", "next_read": "exact chapter/pages" }` — a doorway to the primary text |
| `sensitive` | optional `true` when the topic touches mood, anxiety, self-worth; the app shows a gentle support line |

## Game types

### `venn` — "where are you?" diagram (2 or 3 circles)
Each question is rated on a 5-step scale (0–4). The player's dot moves live between circles.
```json
{"axes": [{"key":"W","label":"Will","color":"#F97316"}, ...],
 "questions": [{"q":"I genuinely want this outcome.","axis":"W"}, {"q":"I'd quit if it got boring.","axis":"W","invert":true}],
 "threshold": 0.55,
 "results": {"W":{"name":"The Dreamer","text":"..."}, "WS":{...}, "WSO":{...}, "":{...}}}
```
`results` keys = sorted axis keys at or above threshold ("" = none). Provide every combination.

### `spectrum` — a marker slides between two poles
```json
{"left":"Fixed","right":"Growth",
 "questions":[{"q":"When I fail a test I think…","options":[{"label":"I'm not a maths person","value":-2},{"label":"I need a different method","value":2}]}],
 "zones":[{"upTo":-0.34,"label":"Fixed-leaning","text":"..."},{"upTo":0.34,"label":"Mixed","text":"..."},{"upTo":1,"label":"Growth-leaning","text":"..."}]}
```
Values range −2…2; position = mean / 2. 3–5 questions.

### `radar` — a shape grows across 4–6 axes
```json
{"axes":["Self-awareness","Self-regulation",...],
 "questions":[{"q":"I can name what I'm feeling within a minute.","axis":0}],
 "advice":{"0":"Lowest on self-awareness? Try ...", "1":"..."}}
```
Questions rated 0–4. `advice` keyed by axis index — shown for the weakest axis. 1–2 questions per axis.

### `swipe` — sort statements left/right
```json
{"prompt":"Can you control it?","left":"Not up to me","right":"Up to me",
 "items":[{"text":"The weather on your wedding day","side":"left","why":"..."}]}
```
4–7 items. Each `why` ≤ 100 chars.

### `choice` — scenario with 1–3 steps
```json
{"steps":[{"scenario":"A friend texts 'I failed my driving test again.' You reply…",
  "options":[{"text":"...","best":true,"feedback":"..."},{"text":"...","feedback":"..."}]}]}
```
2–4 options per step, exactly one `best`. Feedback never mocks a wrong answer.

### `order` — put steps in sequence (tap to order)
```json
{"prompt":"Order the habit loop","items":["Cue","Craving","Response","Reward"],"explain":"..."}
```
`items` are in the correct order; the app shuffles. 3–6 items.

### `estimate` — guess a number on a slider, then see the truth
```json
{"question":"1% better every day for a year makes you how many times better?","min":1,"max":100,"step":1,"unit":"×","answer":37.8,"explain":"1.01^365 ≈ 37.8","anchor":null}
```
Use only numbers you can source. `anchor` (optional) shows a number first to demonstrate anchoring.

### `reveal` — a thought experiment, then a flip
```json
{"prompt":"You're 80. Looking back, which hurts more: the risks you took that failed, or the ones you never took?","choices":["Failed risks","Untaken risks"],"answer":1,"reveal":"Most people regret inactions more over the long run (Gilovich & Medvec, 1995)."}
```
`answer` (optional) = index of the factually right choice; set it whenever the reveal has a right answer, omit it for pure opinion prompts.

## Voice

- Scenarios must fit **anyone**: prefer school, friends, family, hobbies, money and phones over office-only situations. When a scenario is work-specific, the card's `try_team` carries the workplace angle.
- Results of "where are you" games describe *today's answers*, never the person ("you lean…", not "you are…").

- Talk *to* the player, warm and direct, like a sharp friend — not a guru, not a textbook.
- Practical philosophy: always end in something usable.
- Never diagnose ("you have ADHD"), never shame, never promise outcomes. Mood cards are `sensitive: true`.
- Accurate attribution. If a famous idea is disputed (e.g. grit's predictive power, ego depletion, the 10,000-hour rule), the card says so plainly.
- No copyrighted quotes longer than a short phrase. Paraphrase.
