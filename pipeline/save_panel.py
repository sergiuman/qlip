#!/usr/bin/env python3
"""Save a QA-session workflow result as qa/sessions/panel-N.json and print what personas said.
Usage: python3 pipeline/save_panel.py <workflow-output-file>"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
r = json.loads(Path(sys.argv[1]).read_text())["result"]
n = r["session"]
out = {"session": n, "personas": r["panel"], "app_issues": r["appIssues"], "fixes": r["fixes"]}
(ROOT / "qa" / "sessions" / f"panel-{n}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for p in r["panel"]:
    s = p["scores"]
    print(f"{p['persona'][:28]:28} hook {s['hook']} clarity {s['clarity']} useful {s['usefulness']} safe {s['safety']} fun {s['fun']}")
print("fixes:", [(f["domain"], f["applied"], f["validator_errors"]) for f in r["fixes"]])
print("\nAPP ISSUES:")
for a in r["appIssues"]:
    print(f"- [{a['severity']}] {a['from'][:14]}: {a['problem'][:240]}\n    FIX: {a['fix'][:280]}")
