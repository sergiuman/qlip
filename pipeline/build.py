#!/usr/bin/env python3
"""Stage 2 — Build the graph and the site bundle.

concepts.json + cards/*.json  →  data/qlip.json   (what the website loads)
                              →  data/graph_stats.json (centrality, coverage, gaps)

Invalid cards are skipped (and reported), so a bad generation can never break the site.
"""
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import load_cards, load_concepts, validate_card  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def build_graph(concepts, cards):
    g = nx.DiGraph()
    for c in concepts.values():
        g.add_node(c["id"], domain=c["domain"])
    for c in concepts.values():
        for link in c.get("links", []):
            if link["to"] in concepts:
                g.add_edge(c["id"], link["to"], type=link["type"])
    for card in cards:
        for r in card["related"]:
            if r != card["concept"] and not g.has_edge(card["concept"], r):
                g.add_edge(card["concept"], r, type="RELATED")
    return g


def pagerank(g, d=0.85, iters=60):
    """Pure-python PageRank (no numpy dependency, so the daily job runs anywhere)."""
    n = g.number_of_nodes()
    pr = {v: 1 / n for v in g}
    for _ in range(iters):
        sink = sum(pr[v] for v in g if g.out_degree(v) == 0)
        nxt = {v: (1 - d) / n + d * sink / n for v in g}
        for v in g:
            out = g.out_degree(v)
            for w in g.successors(v):
                nxt[w] += d * pr[v] / out
        pr = nxt
    return pr


def stats(g, concepts, cards, domains):
    und = g.to_undirected()
    pr = pagerank(g)
    by_concept = Counter(c["concept"] for c in cards)
    by_domain = Counter(c["domain"] for c in cards)
    types = Counter(c["type"] for c in cards)
    return {
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "components": nx.number_connected_components(und),
        "isolated": [n for n in g.nodes if und.degree(n) == 0],
        "cards": len(cards),
        "cards_by_domain": {d["id"]: by_domain.get(d["id"], 0) for d in domains},
        "cards_by_type": dict(types),
        "concepts_without_cards": [c for c in concepts if by_concept.get(c, 0) == 0],
        "top_pagerank": sorted(pr, key=pr.get, reverse=True)[:10],
        "pagerank": {k: round(v, 4) for k, v in pr.items()},
    }


def main():
    concept_doc = json.loads((ROOT / "content" / "concepts.json").read_text())
    concepts = load_concepts()
    good, bad = [], []
    seen = set()
    for card in load_cards():
        errs = validate_card(card, concepts)
        if errs or card["id"] in seen:
            bad.append((card.get("id"), errs or ["duplicate id"]))
            continue
        seen.add(card["id"])
        good.append(card)
    g = build_graph(concepts, good)
    st = stats(g, concepts, good, concept_doc["domains"])
    bundle = {
        "version": concept_doc.get("version", 1),
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "domains": concept_doc["domains"],
        "concepts": [{k: c[k] for k in ("id", "domain", "name", "line", "thinkers")} |
                     {"links": [l for l in c.get("links", []) if l["to"] in concepts],
                      "rank": st["pagerank"].get(c["id"], 0)}
                     for c in concepts.values()],
        "cards": good,
    }
    DATA.mkdir(exist_ok=True)
    (DATA / "qlip.json").write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "graph_stats.json").write_text(json.dumps(st, indent=1), encoding="utf-8")
    for cid, errs in bad:
        print("SKIP", cid, errs[:3])
    print(f"built: {len(good)} cards ({len(bad)} skipped), {st['nodes']} concepts, {st['edges']} edges, "
          f"{st['components']} component(s), {len(st['concepts_without_cards'])} concepts without cards")


if __name__ == "__main__":
    main()
