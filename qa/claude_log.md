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
