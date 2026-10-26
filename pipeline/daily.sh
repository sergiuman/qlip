#!/bin/zsh
# Qlip daily loop — runs once a day for 10 days (launchd: ~/Library/LaunchAgents/com.qumni.qlip.daily.plist).
# ingest → graph → gaps → generate (Claude CLI or local Ollama) → build → play every card → score → publish if not worse.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
STATE="$ROOT/qa/daily_state.json"
LOG="$ROOT/qa/daily_log.md"
DAY=$(python3 -c "import json,os;print(json.load(open('$STATE'))['day']+1 if os.path.exists('$STATE') else 1)")
END_DAY=10
if [ "$DAY" -gt "$END_DAY" ]; then
  echo "$(date '+%F %T') day $DAY > $END_DAY: loop finished, unloading" >> "$ROOT/qa/daily.out"
  launchctl bootout "gui/$(id -u)/com.qumni.qlip.daily" 2>/dev/null
  exit 0
fi
TODAY=$(date +%F)
LAST=$(python3 -c "import json,os;print(json.load(open('$STATE')).get('last','') if os.path.exists('$STATE') else '')")
[ "$LAST" = "$TODAY" ] && { echo "already ran today"; exit 0; }

echo "\n## Day $DAY — $TODAY\n" >> "$LOG"
git pull -q --rebase 2>>"$LOG"
BEFORE=$(python3 -c "import json;h=json.load(open('qa/history.json'));print(h[-1]['automated'])" 2>/dev/null || echo 0)

python3 pipeline/ingest.py >> "$LOG" 2>&1
python3 pipeline/build.py >> "$LOG" 2>&1
python3 pipeline/gaps.py 4 2 >> "$LOG" 2>&1
ollama list >/dev/null 2>&1 || (open -a Ollama 2>/dev/null; sleep 8)
python3 pipeline/generate.py --max 6 >> "$LOG" 2>&1
python3 pipeline/validate.py | tail -1 >> "$LOG"
python3 pipeline/build.py >> "$LOG" 2>&1
python3 tests/playthrough.py >> "$LOG" 2>&1
SESSION="10$(printf %02d $DAY)"   # daily rows are 1001..1010, separate from the 10 QA sessions
python3 pipeline/qa_score.py --session "$SESSION" --note "daily loop day $DAY" >> "$LOG" 2>&1
OK=$(python3 - <<PY
import json
pt=json.load(open("qa/playthrough.json")); h=json.load(open("qa/history.json"))
row=[r for r in h if r["session"]==int("$SESSION")][0]
print(1 if pt["played_ok"]==pt["cards"] and not pt["console_errors"] and row["detail"]["validator_errors"]==0 and row["automated"] >= float("$BEFORE")-0.5 else 0)
PY
)
if [ "$OK" = "1" ]; then
  git add -A && git commit -qm "Daily loop day $DAY: graph expansion + QA ($TODAY)" && git push -q && echo "- published ✅" >> "$LOG"
else
  echo "- quality gate failed: generated content reverted, only the log is published ❌" >> "$LOG"
  git checkout -q -- content data && git clean -fdq content data
  git add qa && git commit -qm "Daily loop day $DAY: quality gate rejected today's batch" && git push -q
fi
python3 -c "import json;json.dump({'day':$DAY,'last':'$TODAY'},open('$STATE','w'))"
