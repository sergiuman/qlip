#!/usr/bin/env python3
"""Stage 3 — Find what's missing, and what the current content teaches us.

Writes data/gaps.json with an ordered task list for the generator:
  * depth   — central concepts explored from only one angle (needs a second game type)
  * expand  — new concepts grown from library values / dilemmas / learned bridges not yet in the graph
and data/learned.json: exemplar cards (best rated by QA personas) and lessons (recurring QA issues),
which the generator uses as its style guide. This is how content expands from values learned
from current content.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import load_cards, load_concepts  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TYPES = ["venn", "spectrum", "radar", "swipe", "choice", "order", "estimate", "reveal"]


def words(t):
    return set(re.findall(r"[a-z]{4,}", t.lower()))


def learned():
    """Aggregate every QA panel: which cards personas loved, which problems keep recurring."""
    best, problems = Counter(), []
    for p in sorted((ROOT / "qa" / "sessions").glob("panel-*.json")):
        data = json.loads(p.read_text())
        for persona in data.get("personas", []):
            best.update(persona.get("best_cards", []))
            problems += [i["problem"] for i in persona.get("issues", []) if i.get("severity") in ("high", "medium")]
    lessons_path = ROOT / "content" / "lessons.json"
    lessons = json.loads(lessons_path.read_text()) if lessons_path.exists() else []
    return {"exemplars": [cid for cid, _ in best.most_common(6)], "lessons": lessons, "recent_problems": problems[-12:]}


def main(n_depth=4, n_expand=2):
    concepts = load_concepts()
    cards = load_cards()
    stats = json.loads((ROOT / "data" / "graph_stats.json").read_text())
    rank = stats["pagerank"]
    by_concept = {}
    for c in cards:
        by_concept.setdefault(c["concept"], []).append(c["type"])
    type_use = Counter(c["type"] for c in cards)

    depth = []
    for cid in sorted(concepts, key=lambda k: (len(by_concept.get(k, [])), -rank.get(k, 0))):
        have = by_concept.get(cid, [])
        if len(have) >= 2:
            continue
        # least-used type the concept doesn't already have
        t = min((t for t in TYPES if t not in have), key=lambda t: type_use[t])
        type_use[t] += 1
        depth.append({"kind": "depth", "concept": cid, "domain": concepts[cid]["domain"], "type": t, "has": have})
        if len(depth) >= n_depth:
            break

    corpus = json.loads((ROOT / "sources" / "corpus.json").read_text())
    known = set().union(*(words(c["name"] + " " + c["line"]) for c in concepts.values()))
    seeds = []
    for v in corpus["values"]:
        novelty = len(words(v["label"] + " " + (v.get("description") or "")) - known)
        seeds.append({"from": "value", "label": v["label"], "text": v.get("description"), "novelty": novelty})
    for b in corpus["bridges"]:
        seeds.append({"from": "bridge", "label": b.get("emergent_principle_en", "")[:80], "text": b.get("emergent_principle_en"), "novelty": 3})
    taken = {s.lower() for s in json.loads((ROOT / "content" / "concepts.json").read_text()).get("seeds_used", [])}
    seeds = [s for s in seeds if s["label"].lower() not in taken]
    seeds.sort(key=lambda s: -s["novelty"])
    expand = [{"kind": "expand", "seed": s} for s in seeds[:n_expand]]

    out = {"tasks": depth + expand, "concepts_single_card": sum(1 for k in concepts if len(by_concept.get(k, [])) < 2),
           "type_use": dict(type_use)}
    (ROOT / "data" / "gaps.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / "data" / "learned.json").write_text(json.dumps(learned(), indent=1, ensure_ascii=False))
    print(f"gaps: {len(depth)} depth + {len(expand)} expand tasks; {out['concepts_single_card']} concepts still single-angle")


if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:3]))
