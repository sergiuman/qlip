#!/usr/bin/env python3
"""Card validator — enforces docs/CARD_SCHEMA.md.

Usage:  python3 pipeline/validate.py [content/cards/x.json ...]
Exit code 1 if any card has errors. Importable: validate_card(card, concepts) -> list[str].
"""
import json
import re
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TYPES = {"venn", "spectrum", "radar", "swipe", "choice", "order", "estimate", "reveal"}
EVIDENCE = {"strong", "moderate", "contested", "philosophy"}
LIMITS = {"hook": 70, "title": 40, "insight": 320, "model": 110, "try_today": 140}

# Language the app must never use toward a player.
HARM_PATTERNS = [
    r"\byou are (lazy|stupid|weak|broken|worthless|a failure)\b",
    r"\byou (have|suffer from) (adhd|depression|anxiety disorder|bipolar|ocd|autism)\b",
    r"\bkill yourself\b", r"\bkys\b", r"\bloser\b", r"\bpathetic\b",
    r"\bguaranteed\b", r"\bcure[sd]?\b",
]


def load_concepts():
    data = json.loads((ROOT / "content" / "concepts.json").read_text())
    return {c["id"]: c for c in data["concepts"]}


def _req(obj, key, kind, errs, where):
    if key not in obj:
        errs.append(f"{where}: missing '{key}'")
        return False
    if kind and not isinstance(obj[key], kind):
        errs.append(f"{where}: '{key}' should be {kind.__name__ if isinstance(kind, type) else kind}")
        return False
    return True


def validate_game(t, g, errs):
    w = "game"
    if t == "venn":
        if not _req(g, "axes", list, errs, w) or not (2 <= len(g["axes"]) <= 3):
            errs.append("venn: need 2-3 axes"); return
        keys = [a.get("key") for a in g["axes"]]
        if _req(g, "questions", list, errs, w):
            if len(g["questions"]) < len(keys) or len(g["questions"]) > 9:
                errs.append("venn: need between #axes and 9 questions")
            for q in g["questions"]:
                if q.get("axis") not in keys:
                    errs.append(f"venn: question axis {q.get('axis')!r} not in axes")
        if _req(g, "results", dict, errs, w):
            combos = [""] + ["".join(sorted(c)) for r in range(1, len(keys) + 1) for c in combinations(keys, r)]
            for c in combos:
                r = g["results"].get(c)
                if not r or not r.get("name") or not r.get("text"):
                    errs.append(f"venn: missing result for combination {c!r}")
    elif t == "spectrum":
        for k in ("left", "right"):
            _req(g, k, str, errs, w)
        if _req(g, "questions", list, errs, w):
            if not 2 <= len(g["questions"]) <= 6:
                errs.append("spectrum: 2-6 questions")
            for q in g["questions"]:
                vals = [o.get("value") for o in q.get("options", [])]
                if len(vals) < 2 or any(not isinstance(v, (int, float)) or abs(v) > 2 for v in vals):
                    errs.append("spectrum: each question needs >=2 options with value in [-2,2]")
        if _req(g, "zones", list, errs, w):
            if not g["zones"] or g["zones"][-1].get("upTo", 0) < 1:
                errs.append("spectrum: last zone must have upTo >= 1")
    elif t == "radar":
        if _req(g, "axes", list, errs, w) and not 3 <= len(g["axes"]) <= 6:
            errs.append("radar: 3-6 axes")
        n = len(g.get("axes", []))
        if _req(g, "questions", list, errs, w):
            covered = {q.get("axis") for q in g["questions"]}
            if covered != set(range(n)):
                errs.append("radar: every axis needs at least one question (axis = index)")
        if _req(g, "advice", dict, errs, w):
            for i in range(n):
                if str(i) not in g["advice"]:
                    errs.append(f"radar: missing advice for axis {i}")
    elif t == "swipe":
        for k in ("prompt", "left", "right"):
            _req(g, k, str, errs, w)
        if _req(g, "items", list, errs, w):
            if not 3 <= len(g["items"]) <= 8:
                errs.append("swipe: 3-8 items")
            for it in g["items"]:
                if it.get("side") not in ("left", "right") or not it.get("text") or not it.get("why"):
                    errs.append("swipe: item needs text, side left|right, why")
    elif t == "choice":
        if _req(g, "steps", list, errs, w):
            if not 1 <= len(g["steps"]) <= 3:
                errs.append("choice: 1-3 steps")
            for s in g["steps"]:
                opts = s.get("options", [])
                if not s.get("scenario") or not 2 <= len(opts) <= 4:
                    errs.append("choice: step needs scenario and 2-4 options")
                if sum(1 for o in opts if o.get("best")) != 1:
                    errs.append("choice: exactly one best option per step")
                if any(not o.get("text") or not o.get("feedback") for o in opts):
                    errs.append("choice: every option needs text + feedback")
    elif t == "order":
        _req(g, "prompt", str, errs, w)
        _req(g, "explain", str, errs, w)
        if _req(g, "items", list, errs, w) and not 3 <= len(g["items"]) <= 6:
            errs.append("order: 3-6 items")
    elif t == "estimate":
        for k in ("question", "explain"):
            _req(g, k, str, errs, w)
        for k in ("min", "max", "answer"):
            _req(g, k, (int, float), errs, w)
        if all(isinstance(g.get(k), (int, float)) for k in ("min", "max", "answer")):
            if not g["min"] <= g["answer"] <= g["max"]:
                errs.append("estimate: answer outside [min,max]")
    elif t == "reveal":
        _req(g, "prompt", str, errs, w)
        _req(g, "reveal", str, errs, w)
        if _req(g, "choices", list, errs, w) and not 2 <= len(g["choices"]) <= 4:
            errs.append("reveal: 2-4 choices")
        if "answer" in g and not (isinstance(g["answer"], int) and 0 <= g["answer"] < len(g.get("choices", []))):
            errs.append("reveal: answer must be a valid choice index")


def all_text(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from all_text(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_text(v)


def validate_card(card, concepts):
    errs = []
    cid = card.get("id", "?")
    for k in ("id", "concept", "domain", "type", "hook", "title", "game", "insight", "model",
              "try_today", "source", "evidence", "level", "related"):
        if k not in card:
            errs.append(f"missing '{k}'")
    if errs:
        return [f"{cid}: {e}" for e in errs]
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", card["id"]):
        errs.append("id must be kebab-case")
    if card["concept"] in ("snake_case", "id"):
        errs.append("concept id is a placeholder")
    c = concepts.get(card["concept"])
    if not c:
        errs.append(f"unknown concept {card['concept']!r}")
    elif c["domain"] != card["domain"]:
        errs.append(f"domain {card['domain']!r} != concept domain {c['domain']!r}")
    if card["type"] not in TYPES:
        errs.append(f"unknown type {card['type']!r}")
    for k, n in LIMITS.items():
        if len(card[k]) > n:
            errs.append(f"{k} too long ({len(card[k])}>{n})")
    if card["evidence"] not in EVIDENCE:
        errs.append("bad evidence value")
    if card["level"] not in (1, 2, 3):
        errs.append("level must be 1-3")
    src = card["source"]
    if not isinstance(src, dict) or not src.get("thinkers") or not src.get("work"):
        errs.append("source needs thinkers[] and work")
    if "audience" in card and card["audience"] not in ("all", "young", "work"):
        errs.append("audience must be all, young or work")
    if "try_team" in card and (not isinstance(card["try_team"], str) or len(card["try_team"]) > 160):
        errs.append("try_team must be a string <= 160 chars")
    fs = card.get("from_source")
    if fs is not None:
        if not isinstance(fs, dict) or not fs.get("quote") or not fs.get("cite"):
            errs.append("from_source needs quote and cite")
        elif len(fs["quote"].split()) > 30:
            errs.append("from_source.quote must be <= 30 words")
    rel = card["related"]
    if not isinstance(rel, list) or not 1 <= len(rel) <= 3 or any(r not in concepts for r in rel):
        errs.append(f"related must be 1-3 known concept ids: {rel}")
    if card["type"] in TYPES and isinstance(card["game"], dict):
        validate_game(card["type"], card["game"], errs)
    text = " ".join(all_text(card)).lower()
    for p in HARM_PATTERNS:
        if re.search(p, text):
            errs.append(f"harmful/overclaiming language: /{p}/")
    return [f"{cid}: {e}" for e in errs]


def load_cards(paths=None):
    paths = paths or sorted((ROOT / "content" / "cards").glob("*.json"))
    cards = []
    for p in paths:
        try:
            cards += json.loads(Path(p).read_text())
        except json.JSONDecodeError as e:
            print(f"{p}: invalid JSON: {e}")
            sys.exit(1)
    return cards


def main():
    concepts = load_concepts()
    cards = load_cards([Path(a) for a in sys.argv[1:]] or None)
    errs, seen = [], set()
    for card in cards:
        if card.get("id") in seen:
            errs.append(f"{card.get('id')}: duplicate id")
        seen.add(card.get("id"))
        errs += validate_card(card, concepts)
    for e in errs:
        print("ERR", e)
    print(f"{len(cards)} cards, {len(errs)} errors")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
