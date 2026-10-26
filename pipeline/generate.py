#!/usr/bin/env python3
"""Stage 4 — Generate new cards for the gaps, then guard them.

For each task in data/gaps.json:
  author  → a card (and, for "expand" tasks, a new concept node wired into the graph)
  guard   → an independent pass that checks accuracy, kindness and playability and returns a fixed card
  gate    → validate.py rules; up to 3 retries with the errors fed back
Accepted cards are appended to content/cards/<domain>.json and logged to qa/generated.jsonl.

Backends: the Claude CLI (`claude -p`) when it is signed in, otherwise local Ollama (gemma2).
    python3 pipeline/generate.py [--backend auto|claude|ollama] [--max N] [--dry]
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import load_cards, load_concepts, validate_card  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = (ROOT / "docs" / "CARD_SCHEMA.md").read_text()
OLLAMA_MODEL = "gemma2:latest"


# ---------- backends ----------
def claude_ok():
    try:
        r = subprocess.run(["claude", "-p", "Reply with exactly: ok"], capture_output=True, text=True, timeout=90, cwd="/tmp")
        return r.returncode == 0 and "ok" in r.stdout.lower()
    except (OSError, subprocess.TimeoutExpired):
        return False


def ask_claude(prompt):
    r = subprocess.run(["claude", "-p", prompt], capture_output=True, text=True, timeout=600, cwd="/tmp")
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-300:] or r.stdout[-300:])
    return r.stdout


def ask_ollama(prompt):
    body = json.dumps({"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json",
                       "options": {"temperature": 0.6, "num_ctx": 8192}}).encode()
    req = urllib.request.Request("http://localhost:11434/api/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read())["response"]


def parse_json(text):
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=0)
    return json.loads(text[start:])


# ---------- prompts ----------
TYPE_HINT = {
    "venn": "Venn reminder: `results` needs EVERY key: \"\" plus each axis key alone, each pair and the triple, with keys' letters sorted alphabetically.",
    "spectrum": "Spectrum reminder: option values are numbers from -2 (left pole) to 2 (right pole); zones ascend by upTo and the last has upTo 1.",
    "choice": "Choice reminder: exactly one option per step has \"best\": true; every option has feedback.",
    "estimate": "Estimate reminder: min <= answer <= max, all numbers; only use a number you can cite in explain.",
    "reveal": "Reveal reminder: include \"answer\" (index) if one choice is factually right.",
}

def exemplar_cards(cards, task_type, learned):
    by_id = {c["id"]: c for c in cards}
    ex = [by_id[i] for i in learned.get("exemplars", []) if i in by_id]
    same = [c for c in cards if c["type"] == task_type]
    picks = ([c for c in ex if c["type"] == task_type] or same[:1]) + ex[:1]
    return json.dumps(picks[:2], ensure_ascii=False)


def author_prompt(task, concepts, cards, learned):
    common = f"""You write cards for Qlip: a TikTok-style feed of 30-second games teaching practical philosophy and psychology
("alternative psychology"). Every card must leave the player better off: warm, accurate, never shaming, never diagnosing.
Write for anyone (teens to retirees, non-native English speakers): plain words, everyday scenarios, not office-only.

CARD SCHEMA AND RULES:
{SCHEMA}

EXEMPLARS players loved (match their energy, not their topic):
{exemplar_cards(cards, task.get('type', 'choice'), learned)}

LESSONS from QA sessions (obey them):
{json.dumps(learned.get('lessons', []), ensure_ascii=False)}
"""
    if task["kind"] == "depth":
        c = concepts[task["concept"]]
        existing = [x for x in cards if x["concept"] == c["id"]]
        return common + f"""
{TYPE_HINT.get(task['type'], '')}
TASK: write ONE new card of type "{task['type']}" for concept "{c['id']}" (domain "{c['domain']}"): {c['name']} — {c['line']}
Thinkers: {', '.join(c['thinkers'])}. Graph links: {json.dumps(c.get('links', []))}.
It must teach the idea from a DIFFERENT angle than the existing card(s): {json.dumps([{'id': x['id'], 'hook': x['hook']} for x in existing], ensure_ascii=False)}
"related" must use ids from this list only: {', '.join(sorted(concepts))}.
Return ONLY the card as a JSON object."""
    seed = task["seed"]
    domains = sorted({c["domain"] for c in concepts.values()})
    return common + f"""
TASK: grow the graph. From this value found in the owner's library, propose ONE new concept that is NOT already in the graph,
then write ONE card for it.
Seed: {seed['label']} — {seed['text']}
Existing concept ids (do not duplicate): {', '.join(sorted(concepts))}
Domains: {', '.join(domains)}
Return ONLY a JSON object: {{"concept": {{"id": "snake_case", "domain": one of the domains, "name": "≤40 chars", "line": "≤110 chars",
"thinkers": [real people], "sources": [], "links": [{{"to": existing concept id, "type": "BUILDS_ON|AMPLIFIES|CONTRASTS|REMEDIES|PART_OF"}}, ... 2-3 links]}},
"card": {{...a full card whose "concept" is the new id...}}}}"""


def guard_prompt(card):
    return f"""You are the safety and accuracy guard for Qlip, a learning game for anyone including teens and people who feel fragile.
Check this card and return a corrected version. Fix: factual or attribution errors (mark disputed findings "contested" and say so),
any shaming/diagnosing/pressuring language, mood or self-worth topics missing "sensitive": true, games that don't work as specified
(see schema), hooks that merely repeat the question, insight longer than 200 characters, try_today that isn't doable in 10 minutes.
SCHEMA:
{SCHEMA}
CARD:
{json.dumps(card, ensure_ascii=False)}
Return ONLY the corrected card as a JSON object."""


LIMITS = {"hook": 70, "title": 40, "insight": 200, "model": 110, "try_today": 140, "try_team": 160}


def shorten_fields(card, ask):
    """Small models overshoot length limits; repair each long field with a single focused rewrite."""
    for field, n in LIMITS.items():
        for _ in range(3):
            text = card.get(field)
            if not isinstance(text, str) or len(text) <= n:
                break
            out = ask(f'Rewrite this {field.replace("_", " ")} in at most {n - 8} characters, same meaning, same voice. '
                      f'Return JSON {{"text": "..."}} only.\n\nText: {text}')
            try:
                card[field] = parse_json(out)["text"].strip()
            except Exception:  # noqa: BLE001
                card[field] = text
    return card


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="auto", choices=["auto", "claude", "ollama"])
    ap.add_argument("--max", type=int, default=6)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    backend = a.backend
    if backend == "auto":
        backend = "claude" if claude_ok() else "ollama"
    ask = ask_claude if backend == "claude" else ask_ollama
    print(f"backend: {backend}")
    simple = ["choice", "reveal", "estimate", "swipe", "spectrum"]  # what a small local model writes reliably

    gaps = json.loads((ROOT / "data" / "gaps.json").read_text())
    learned = json.loads((ROOT / "data" / "learned.json").read_text())
    concepts_doc = json.loads((ROOT / "content" / "concepts.json").read_text())
    accepted, log = 0, open(ROOT / "qa" / "generated.jsonl", "a")
    for task in gaps["tasks"][: a.max]:
        if backend == "ollama" and task.get("type") not in (None, *simple):
            task["type"] = next((t for t in simple if t not in task.get("has", [])), "choice")
        concepts = load_concepts()
        cards = load_cards()
        ids = {c["id"] for c in cards}
        prompt = author_prompt(task, concepts, cards, learned)
        new_concept, card, errs = None, None, ["not generated"]
        for attempt in range(3):
            try:
                out = parse_json(ask(prompt if attempt == 0 else prompt + f"\n\nYour last answer had these errors, fix them:\n{errs}\nPrevious answer:\n{json.dumps(card or {}, ensure_ascii=False)[:4000]}"))
                if task["kind"] == "expand":
                    new_concept, card = out.get("concept"), out.get("card")
                    cid = (new_concept or {}).get("id", "")
                    if not new_concept or cid in concepts or cid in ("snake_case", "id", "new_id") or not re.fullmatch(r"[a-z]+(_[a-z]+)+", cid):
                        errs = ["concept id must be a NEW descriptive snake_case name, e.g. 'truthful_courage' (not the word 'snake_case')"]; continue
                    new_concept["links"] = [l for l in new_concept.get("links", []) if l.get("to") in concepts][:3]
                    if not new_concept["links"]:
                        errs = ["concept needs links to existing concepts"]; continue
                    concepts = dict(concepts, **{new_concept["id"]: new_concept})
                else:
                    card = out
                card = parse_json(ask(guard_prompt(card))) if card else card
                if isinstance(card, dict):
                    card = shorten_fields(card, ask)
                if task["kind"] == "expand" and card:
                    card["concept"], card["domain"] = new_concept["id"], new_concept["domain"]
                errs = validate_card(card, concepts) if isinstance(card, dict) else ["card is not an object"]
                if isinstance(card, dict) and card.get("id") in ids:
                    errs.append("id already exists — choose a new id")
                if not errs:
                    break
            except Exception as e:  # noqa: BLE001 — model output is untrusted; retry
                errs = [f"exception: {e}"]
        status = "accepted" if not errs else "rejected"
        log.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "backend": backend,
                              "task": task, "status": status, "errors": errs[:5], "card_id": (card or {}).get("id") if isinstance(card, dict) else None}) + "\n")
        print(status, task["kind"], task.get("concept") or task["seed"]["label"], errs[:2] if errs else card["id"])
        if errs or a.dry:
            continue
        if new_concept:
            concepts_doc["concepts"].append({k: new_concept[k] for k in ("id", "domain", "name", "line", "thinkers", "sources", "links") if k in new_concept})
            concepts_doc.setdefault("seeds_used", []).append(task["seed"]["label"])
            (ROOT / "content" / "concepts.json").write_text(json.dumps(concepts_doc, indent=1, ensure_ascii=False))
        path = ROOT / "content" / "cards" / f"{card['domain']}.json"
        arr = json.loads(path.read_text())
        arr.append(card)
        path.write_text(json.dumps(arr, indent=2, ensure_ascii=False))
        accepted += 1
        q = ROOT / "data" / "needs_review.json"
        queue = json.loads(q.read_text()) if q.exists() else {"cards": [], "why": "generated by the daily loop; bring to house standard"}
        queue["cards"].append(card["id"])
        q.write_text(json.dumps(queue, indent=1))
    print(f"accepted {accepted}/{min(a.max, len(gaps['tasks']))}")


if __name__ == "__main__":
    main()
