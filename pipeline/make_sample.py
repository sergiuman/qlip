#!/usr/bin/env python3
"""Pick the card sample a QA session reviews: flagship + cards never reviewed before + a rotating slice.
Usage: python3 pipeline/make_sample.py N  -> qa/sessions/sample-N.txt"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
n = int(sys.argv[1])
ids = [c["id"] for c in json.loads((ROOT / "data" / "qlip.json").read_text())["cards"]]
seen = set()
for p in (ROOT / "qa" / "sessions").glob("sample-*.txt"):
    if p.name != f"sample-{n}.txt":
        seen |= set(p.read_text().split(","))
fresh = [i for i in ids if i not in seen]
rot = [ids[(n * 11 + k * 5) % len(ids)] for k in range(len(ids))]
pick = list(dict.fromkeys(["wso-triad-venn"] + fresh[:14] + rot))[:24]
(ROOT / "qa" / "sessions" / f"sample-{n}.txt").write_text(",".join(pick))
print(f"sample-{n}: {len(pick)} cards ({min(14, len(fresh))} never reviewed)")
