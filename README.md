# Qlip — models for living, one swipe at a time

**Live:** https://sergiuman.github.io/qlip/

Qlip is a TikTok-format feed of 30-second games about the models that run your life: practical
philosophy and "alternative psychology" you *play* instead of read. Each qlip has a hook, a tiny
game that puts you inside the idea (a Venn diagram your dot moves through, a spectrum, a radar,
a swipe sort, a scenario, an estimate…), then names the model and gives you one thing to try today.

It grows out of the QUMNI frameworks (WSO — Will·Skill·Opportunity, PCF — Perceptual Control) and
a library of 17 book adaptations, organized as a **knowledge graph**: 12 domains, 72 concepts,
typed edges (BUILDS_ON, AMPLIFIES, CONTRASTS, REMEDIES, PART_OF). The feed walks that graph:
what you play next is chosen from the neighbours of what you just played, balanced for novelty.

## Layout

| path | what |
|---|---|
| `index.html`, `app.js`, `styles.css`, `sw.js` | the static site (no build step; works on any host, ports to qumni.com as-is) |
| `content/concepts.json` | the concept graph (hand-curated backbone) |
| `content/cards/<domain>.json` | the games — schema in `docs/CARD_SCHEMA.md` |
| `data/qlip.json` | built bundle the site loads |
| `pipeline/` | the workflow: ingest → build graph → find gaps → generate → validate → QA → publish |
| `qa/` | QA history (measured scores per session), persona panels, daily logs |
| `tests/` | Playwright play-through of every card + axe accessibility checks |

## The workflow

See `docs/WORKFLOW.md`. In short:

```
python3 pipeline/ingest.py      # 1. review & organize every source into sources/corpus.json
python3 pipeline/build.py       # 2. concepts + cards -> graph, bundle, stats
python3 pipeline/gaps.py        # 3. what's missing in the graph (+ what top cards teach us)
python3 pipeline/generate.py    # 4. new cards for the gaps (Claude CLI, falls back to local Ollama)
python3 tests/playthrough.py    # 5. play every card in a real browser
python3 pipeline/qa_score.py --session N   # 6. composite score; must beat the last one
```

`pipeline/daily.sh` runs the whole loop once a day for 10 days (launchd), publishing only if quality didn't drop.

## Principles

Always useful, never harmful: no diagnosis, no shame, disputed science is labelled as such,
mood topics carry a support line, and answers never leave your browser.
