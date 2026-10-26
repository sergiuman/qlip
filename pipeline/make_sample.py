#!/usr/bin/env python3
"""Pick the cards a QA session reviews.

From session 11 each persona reviews the feed it would actually get after choosing a world in the app
(young = School & mates, work = Work, life = Everyday life): flagship + never-reviewed cards first + a rotating slice,
restricted to cards the app would show in that world. Writes qa/sessions/sample-N-<world>.txt and the union as sample-N.txt.
Usage: python3 pipeline/make_sample.py N"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
n = int(sys.argv[1])
cards = json.loads((ROOT / "data" / "qlip.json").read_text())["cards"]
seen = set()
for p in (ROOT / "qa" / "sessions").glob("sample-*.txt"):
    if not p.name.startswith(f"sample-{n}"):
        seen |= set(p.read_text().split(","))


def in_world(c, w):
    return c["audience"] == "all" or c["audience"] == {"young": "young", "work": "work"}.get(w)


union = []
for w in ("young", "work", "life"):
    ids = [c["id"] for c in cards if in_world(c, w)]
    fresh = [i for i in ids if i not in seen]
    rot = [ids[(n * 11 + k * 5) % len(ids)] for k in range(len(ids))]
    pick = list(dict.fromkeys(["wso-triad-venn"] + fresh[:10] + rot))[:20]
    (ROOT / "qa" / "sessions" / f"sample-{n}-{w}.txt").write_text(",".join(pick))
    union += pick
    print(f"sample-{n}-{w}: {len(pick)} cards ({min(10, len(fresh))} never reviewed)")
(ROOT / "qa" / "sessions" / f"sample-{n}.txt").write_text(",".join(dict.fromkeys(union)))
