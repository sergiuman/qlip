#!/usr/bin/env python3
"""Stage 5 — Measured QA scorecard.

Composite score (0-100) = automated checks (0-50) + persona panel (0-50).

  python3 pipeline/qa_score.py --session N [--panel qa/sessions/panel-N.json] [--note "what changed"]

Reads validator output, qa/playthrough.json (tests/playthrough.py) and graph stats,
appends one row to qa/history.json and prints the breakdown. A session only "passes"
when its composite beats the previous session's — that is the incremental-outcome rule.
"""
import argparse
import json
import math
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import load_cards, load_concepts, validate_card  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / "qa" / "history.json"
NOT_VERBS = {"the", "a", "an", "your", "you", "if", "when", "this", "it", "my", "i", "next", "today", "before", "after", "for", "once"}


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups) - (1 if w.endswith("e") and len(groups) > 1 else 0)
    return max(1, n)


def flesch(text):
    sents = max(1, len(re.findall(r"[.!?]+", text)))
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return 100
    syl = sum(syllables(w) for w in words)
    return 206.835 - 1.015 * len(words) / sents - 84.6 * syl / len(words)


def entropy_ratio(counter, k):
    tot = sum(counter.values())
    if not tot or k < 2:
        return 0
    h = -sum(v / tot * math.log(v / tot) for v in counter.values() if v)
    return h / math.log(k)


def automated():
    concepts = load_concepts()
    cards = load_cards()
    errs = sum(len(validate_card(c, concepts)) for c in cards)
    pt = json.loads((ROOT / "qa" / "playthrough.json").read_text())
    st = json.loads((ROOT / "data" / "graph_stats.json").read_text())
    reading = sum(flesch(c["insight"]) for c in cards) / len(cards)
    verb_ok = sum(1 for c in cards if c["try_today"].split()[0].lower().strip("'\"") not in NOT_VERBS) / len(cards)
    sources_ok = sum(1 for c in cards if c["source"].get("work") and c["source"].get("thinkers")) / len(cards)
    sens = [c for c in cards if c.get("sensitive")]
    a11y = len(pt.get("a11y", []))
    m = {
        "schema": 5 * (1 if errs == 0 else max(0, 1 - errs / 20)),
        "playthrough": 10 * pt["played_ok"] / max(1, pt["cards"]),
        "console": 5 * (1 if not pt["console_errors"] else max(0, 1 - len(pt["console_errors"]) / 5)),
        "overflow": 3 * (1 if not pt["overflow"] else 0),
        "a11y": 7 * max(0, 1 - a11y / 8),
        "readability": 5 * min(1, max(0, (reading - 30) / 35)),       # Flesch 65+ = full marks
        "actionable": 4 * verb_ok,
        "sourced": 2 * sources_ok,
        "graph_connected": 2 * (1 if st["components"] == 1 else 0),
        "coverage": 3 * (1 - len(st["concepts_without_cards"]) / max(1, st["nodes"])),
        "type_diversity": 2 * entropy_ratio(Counter(st["cards_by_type"]), 8),
        "domain_balance": 2 * entropy_ratio(Counter(st["cards_by_domain"]), len(st["cards_by_domain"])),
    }
    detail = {"validator_errors": errs, "cards": len(cards), "played_ok": pt["played_ok"], "console_errors": len(pt["console_errors"]),
              "overflow": len(pt["overflow"]), "a11y_serious": a11y, "flesch_avg": round(reading, 1), "try_today_verb_rate": round(verb_ok, 3),
              "sensitive_cards": len(sens), "first_card_ms": pt.get("first_card_ms"), "edges": st["edges"]}
    return {k: round(v, 2) for k, v in m.items()}, detail


def panel_score(path):
    if not path or not Path(path).exists():
        return None, {}
    data = json.loads(Path(path).read_text())
    dims = ["hook", "clarity", "usefulness", "safety", "fun"]
    per = []
    for p in data["personas"]:
        per.append(sum(p["scores"][d] for d in dims) / len(dims))
    avg = sum(per) / len(per)
    by_dim = {d: round(sum(p["scores"][d] for p in data["personas"]) / len(data["personas"]), 2) for d in dims}
    return round(avg * 5, 2), {"persona_avg_10": round(avg, 2), "by_dim": by_dim}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, required=True)
    ap.add_argument("--panel")
    ap.add_argument("--note", default="")
    a = ap.parse_args()
    auto, detail = automated()
    auto_total = round(sum(auto.values()), 2)
    pscore, pdetail = panel_score(a.panel)
    hist = json.loads(HIST.read_text()) if HIST.exists() else []
    prev = hist[-1]["composite"] if hist else None
    composite = round(auto_total + (pscore if pscore is not None else 0), 2)
    row = {"session": a.session, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "automated": auto_total,
           "panel": pscore, "composite": composite, "delta": None if prev is None else round(composite - prev, 2),
           "passed": prev is None or composite > prev, "breakdown": auto, "detail": detail, "panel_detail": pdetail, "note": a.note}
    hist = [h for h in hist if h["session"] != a.session] + [row]
    hist.sort(key=lambda h: h["session"])
    HIST.write_text(json.dumps(hist, indent=1))
    print(json.dumps({k: row[k] for k in ("session", "automated", "panel", "composite", "delta", "passed")}))
    print("breakdown:", auto)
    print("detail:", detail, pdetail)


if __name__ == "__main__":
    main()
