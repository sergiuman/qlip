#!/bin/zsh
# Qlip local daily loop (launchd: com.qumni.qlip.daily, runs in its own clone at ~/qlip-loop).
# Starts from whatever is on GitHub, generates a few cards with local Ollama (or the Claude CLI when signed in),
# plays and scores everything, and publishes only its OWN files:
#   content/cards/daily-<date>.json   qa/daily_log.md   qa/daily_history.json   qa/generated.jsonl   data/*
# The Claude daily task folds daily-*.json into the domain files and reviews them, so the two loops never edit
# the same file. If the push is rejected, it re-applies its own files on top of the newest version and retries.
set -u
setopt null_glob
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
END_DATE="2026-11-10"
STATE="$HOME/.qlip-loop-state.json"
TODAY=$(date +%F)
if [[ "$TODAY" > "$END_DATE" ]]; then
  echo "$(date '+%F %T') past $END_DATE: loop finished, unloading"
  launchctl bootout "gui/$(id -u)/com.qumni.qlip.daily" 2>/dev/null
  exit 0
fi
LAST=$(python3 -c "import json,os;print(json.load(open('$STATE')).get('last','') if os.path.exists('$STATE') else '')")
[ "$LAST" = "$TODAY" ] && { echo "already ran today"; exit 0; }
DAY=$(python3 -c "import json,os;print(json.load(open('$STATE'))['day']+1 if os.path.exists('$STATE') else 1)")

git fetch -q origin && git reset -q --hard origin/main && git clean -fdq
[ -d tests/node_modules/axe-core ] || npm install --prefix tests --silent >/dev/null 2>&1
LOG="$ROOT/qa/daily_log.md"
DAILY="content/cards/daily-$TODAY.json"
SECTION=$(mktemp)
{
  echo "\n## Day $DAY — $TODAY\n"
  python3 pipeline/ingest.py
  python3 pipeline/build.py
  python3 pipeline/gaps.py 6 0
  ollama list >/dev/null 2>&1 || (open -a Ollama 2>/dev/null; sleep 8)
  python3 pipeline/generate.py --max 6 --out "$DAILY"
  python3 pipeline/validate.py | tail -1
  python3 pipeline/build.py
  python3 tests/playthrough.py
  python3 pipeline/qa_score.py --session "$((1000 + DAY))" --hist qa/daily_history.json --note "local daily loop day $DAY"
} > "$SECTION" 2>&1
OK=$(python3 - <<PY
import json
pt = json.load(open("qa/playthrough.json"))
import subprocess
v = subprocess.run(["python3", "pipeline/validate.py"], capture_output=True, text=True).returncode
print(1 if pt["played_ok"] == pt["cards"] and not pt["console_errors"] and v == 0 else 0)
PY
)
if [ "$OK" != "1" ]; then
  rm -f "$DAILY"; python3 pipeline/build.py >/dev/null
  echo "- quality gate failed: today's cards discarded ❌" >> "$SECTION"
fi

# Save our own outputs, then publish them on top of the newest GitHub state (retry if the other loop pushed first).
KEEP=$(mktemp -d)
for f in "$DAILY" qa/daily_history.json qa/generated.jsonl; do [ -f "$f" ] && mkdir -p "$KEEP/$(dirname $f)" && cp "$f" "$KEEP/$f"; done
for attempt in 1 2 3; do
  cat "$SECTION" >> "$LOG"
  git add -A content/cards/daily-*.json qa/daily_log.md qa/daily_history.json qa/generated.jsonl data 2>/dev/null
  if git commit -qm "Local daily loop day $DAY ($TODAY): Ollama cards for review + QA" && git push -q origin main; then
    echo "published day $DAY" ; break
  fi
  git fetch -q origin && git reset -q --hard origin/main
  (cd "$KEEP" && find . -type f) | while read f; do mkdir -p "$(dirname $f)"; cp "$KEEP/$f" "$f"; done
  python3 pipeline/build.py >/dev/null
  sleep 20
done
python3 -c "import json;json.dump({'day':$DAY,'last':'$TODAY'},open('$STATE','w'))"
rm -rf "$KEEP" "$SECTION"
