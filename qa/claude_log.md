# Claude daily loop log

## 2026-11-01 — session 16 (full scored)
- automated 49.44 · panel 26.67 · composite 76.11 · delta -7.72 vs session 15 (83.83) · passed: no
- cards 208 → 213 (5 merged from daily-2026-11-01.json; 17 Ollama cards in the review queue brought to house standard by the fixers, queue emptied)
- why it failed: the panel saw the unreviewed Ollama cards before the fixers ran — reveal choices as objects ("[object Object]"), literal markdown asterisks, inflated "strong" evidence, concept models inverted (shifting the burden, will gap), adult scenarios tagged "all" in the School feed
- fixes: reveal renderer tolerates object choices; multi-step choice header no longer says "Good instincts" when the last pick was wrong ("Close. Here's the trick."); validate.py now rejects non-string reveal choices and markdown asterisks; build.py world inference counts spreadsheets/at work/after work/coworkers as work markers; lesson recorded
- left undone: evidence-badge audit across older cards; a stricter "all"-audience audit for teen-fit scenarios

## 2026-11-02 — session 17 (full scored)
- automated 49.51 · panel 33.83 · composite 83.34 · delta +7.23 vs session 16 (76.11) · passed: yes (10 of 10 scored sessions passed; lean reviews from tomorrow)
- cards 213 → 214 (1 merged from daily-2026-11-02.json: introvert-energy-recharge, rewritten to house standard *before* the panel so it never scored an unreviewed card; queue emptied)
- fixes: picked world now leads the feed (+6 boost, +4 more when neither of the last 2 cards came from it); same concept blocked within 12 cards (was 6); "Because you played" lines in plain words instead of graph-edge verbs ("amplifies"); Venn dot sits outside every circle when no pillar is lit (was in the all-three overlap); swipe recap shows a neutral ↔ and "Usually:" instead of an orange ✗ and "Belongs in:"; map says "N ideas lit so far" and only shows "of 88" from 10 up; lesson recorded on world fit
- left undone: goal/habit cluster cap (about 9 of 20 cards were one lesson for the life persona); choice-option length balance lint; map label overlap and progressive reveal; empty space under Play on the first screen

## 2026-11-06 — session 2006 (lean)
- automated 49.51 · panel 32.67 · composite 82.18 · delta +33.41 · passed: yes. The delta compares against automated-only session 1001, so it means little; against session 17 (83.34, full panel) the score is 1.16 lower, with a different panel of 3 personas (10 of 10 scored sessions passed)
- automated and panel were both measured before today's fixes; the panel has not seen them yet
- cards 214 → 214 (0 merged, review queue already empty; fixers applied 329 content edits across all 12 domains, 0 validator errors)
- fixes: first 10 cards of a picked School or Work feed now come from that world, then it alternates with "all" cards (the opening "all" flagship cards are skipped for those worlds); reveal fits one phone screen, with insight and quote behind "Why?" (left open on contested and sensitive cards so caveats stay visible); after a choice game the reveal scrolls into view; on phones the rail folds into a row of icons on the reveal; clearer copy ("Here's another way to see it", "Good instincts.", no "keep your map balanced", neutral dot in swipe recap); lesson recorded
- QA tooling: make_sample.py was reviewing a rotating slice of cards, not the feed mix, so the panel's "9 of 20 work cards" and "4 of 19 young cards" overstated the problem. It now follows the app's mix for young and work. Lean panels from tomorrow see that mix, so they aren't strictly comparable with today's
- left undone: Play tap still before the first game; "My toolkit" list and team-exercise filter on the map; managers' track; merging the rail's Why this and About; anecdote and untested-framework evidence tiers; young pool still small (33 cards)
- note: no commits from either loop between 2026-11-03 and 2026-11-05, and today's merge found no new local cards, so check whether the local loop is still running
