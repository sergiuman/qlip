# The Qlip workflow

A graph-driven content engine: everything (sources, concepts, cards, QA findings) is a node or an
edge, and every stage reads the graph to decide what to do next.

```
 sources (library, QUMNI)          concepts.json (graph)              cards/*.json
        │ ingest.py                        ▲   │ build.py                   │
        ▼                                  │   ▼                            ▼
 sources/corpus.json ──► gaps.py ──► data/gaps.json ──► generate.py ──► validate.py ──► build.py
                           ▲                 (depth + expand)  (author → guard → gate)        │
                           │                                                                    ▼
  content/lessons.json ◄── QA panels ◄── qa_score.py ◄── tests/playthrough.py ◄── data/qlip.json ──► site
  data/learned.json         (6 personas + fact-check + 12 fixers)                                   (GitHub Pages)
```

## Stages

| # | stage | script | output |
|---|---|---|---|
| 1 | Review & organize all material | `pipeline/ingest.py` | `sources/corpus.json` — 19 sources, ~500k words, 28 values, 17 dilemmas, learned bridges |
| 2 | Build the graph | `pipeline/build.py` | `data/qlip.json` (site bundle), `data/graph_stats.json` (PageRank, coverage, components) |
| 3 | Consolidate what's missing | `pipeline/gaps.py` | `data/gaps.json` — *depth* tasks (central concepts seen from one angle) and *expand* tasks (new concepts from library values); `data/learned.json` — exemplar cards and recurring problems from QA |
| 4 | Generate | `pipeline/generate.py` | new cards (and concept nodes) — author → guard → schema gate, with length repair. Claude CLI when signed in, local Ollama `gemma2` otherwise |
| 5 | Play every card | `tests/playthrough.py` | `qa/playthrough.json` — Playwright on a phone viewport, every card to its reveal, axe-core in dark + light |
| 6 | Score | `pipeline/qa_score.py` | `qa/history.json` — composite = automated (0-50) + persona panel (0-50) |
| 7 | Persona QA session | `pipeline/qa_session.workflow.js` | 6 personas (teen, manager, philosopher, anxious grad, research psychologist, game designer) + an online fact-checker; 12 domain fixers apply the findings |

## The incremental rule

A QA session passes only when its composite beats the previous session's. The automated half
measures: schema, play-through, console errors, overflow, accessibility, readability, actionable
try-todays, sourcing, graph connectivity, concept coverage, type diversity, domain balance,
concept depth, hooks that add tension, and short reveals. The panel half is the average of the
personas' 1-10 ratings on hook, clarity, usefulness, safety and fun.

## Daily loop (10 days, from 2026-10-26)

Two loops, so it improves even if one can't run:

- **Local, offline** — `pipeline/daily.sh` via launchd (`~/Library/LaunchAgents/com.qumni.qlip.daily.plist`, 09:15).
  Generates ~6 cards with Ollama (or the Claude CLI if signed in), plays and scores everything, publishes
  only if nothing regressed, otherwise reverts the batch and publishes the log. Unloads itself after day 10.
- **Claude, deeper** — desktop-app scheduled task `qlip-daily-improve` (10:30). Runs a full persona QA
  session, fixes app issues, records lessons, expands the graph with agents (+6-10 cards/day), gates and publishes.
  Stops itself after 2026-11-05.

Logs: `qa/daily_log.md`, `qa/generated.jsonl`, `qa/history.json`.

## Porting to qumni.com

The site is static (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.json`, `assets/`, `data/qlip.json`).
Copy those into a folder on the PHP host (e.g. `/qlip/`); no server code needed. All paths are relative.
