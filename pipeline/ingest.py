#!/usr/bin/env python3
"""Stage 1 — Ingest: review and organize every source the Qlip graph learns from.

Scans the local library (Books series, the existing values graph, the Qumni
WSO/PCF frameworks) and writes sources/corpus.json: one record per source with
its domain, size, key values and where it lives on disk. Nothing is copied —
the corpus is an index so later stages (and agents) know what exists.
"""
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = Path("/Users/sergiuman/Desktop/Gemini/Books")
QUMNI = ROOT.parent
OUT = ROOT / "sources" / "corpus.json"


def html_text(path: Path) -> str:
    t = path.read_text(encoding="utf-8", errors="ignore")
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def words(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="ignore").split())
    except OSError:
        return 0


def ingest_books(kg: dict) -> list:
    inv = json.loads((BOOKS / "catalog" / "master_inventory.json").read_text())
    values_by_book = {}
    for e in kg.get("edges", []):
        if e["type"] == "TEACHES_VALUE":
            values_by_book.setdefault(e["source"], []).append(e["target"])
    labels = {n["id"]: n.get("label_en") for n in kg["nodes"]}
    out = []
    for b in inv["books"]:
        manuscripts = [Path(p) for k, p in b["paths"].items() if p and k.startswith("manuscript") and Path(p).exists()]
        out.append({
            "id": b["id"],
            "kind": "book_adaptation",
            "source_book": b["source_book"],
            "author": b["source_author"],
            "domain": b["domain"],
            "subdomain": b.get("psych_subdomain"),
            "titles": b.get("titles"),
            "manuscripts": [str(p) for p in manuscripts],
            "words": sum(words(p) for p in manuscripts),
            "values": [labels.get(v, v) for v in values_by_book.get(b["id"], [])],
        })
    return out


def ingest_qumni() -> list:
    out = []
    for name, title, layer in [("wso.html", "WSO — Will, Skill, Opportunity", "action"),
                               ("pcf.html", "PCF — Perceptual Control Framework", "perception")]:
        p = QUMNI / name
        if not p.exists():
            continue
        text = html_text(p)
        dump = ROOT / "sources" / f"qumni_{name.split('.')[0]}.txt"
        dump.write_text(text, encoding="utf-8")
        out.append({"id": f"qumni_{name.split('.')[0]}", "kind": "framework", "title": title,
                    "layer": layer, "path": str(p), "text_dump": str(dump), "words": len(text.split())})
    return out


def main():
    try:
        kg = json.loads((BOOKS / "data" / "knowledge_graph.json").read_text())
    except OSError as e:
        # Background jobs can't read ~/Desktop on macOS; the committed index is still valid.
        print(f"library not readable here ({e.__class__.__name__}); keeping existing sources/corpus.json")
        return
    books = ingest_books(kg)
    qumni = ingest_qumni()
    values = [{"id": n["id"], "label": n.get("label_en"), "description": n.get("description_en")}
              for n in kg["nodes"] if n["type"] == "value"]
    dilemmas = [{"id": n["id"], "label": n.get("label_en"), "description": n.get("description_en")}
                for n in kg["nodes"] if n["type"] == "dilemma"]
    corpus = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": qumni + books,
        "values": values,
        "dilemmas": dilemmas,
        "bridges": kg.get("learned_bridges", []),
        "totals": {
            "sources": len(qumni) + len(books),
            "words": sum(s["words"] for s in qumni + books),
            "values": len(values),
            "dilemmas": len(dilemmas),
        },
    }
    OUT.write_text(json.dumps(corpus, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"corpus: {corpus['totals']}")


if __name__ == "__main__":
    main()
