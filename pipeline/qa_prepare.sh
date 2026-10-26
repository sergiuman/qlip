#!/bin/zsh
# Prepare QA session N: validate, build, pick sample, play every card (with screenshots), snapshot the automated score.
# Usage: pipeline/qa_prepare.sh N "what changed since last session"
set -e
cd "$(dirname "$0")/.."
N=$1; NOTE=${2:-}
python3 pipeline/validate.py | tail -1
python3 pipeline/build.py
python3 pipeline/make_sample.py "$N"
rm -rf "qa/screens/s$N"
python3 tests/playthrough.py --shots "qa/screens/s$N" --shoot "$(cat qa/sessions/sample-$N.txt)" | head -2
python3 pipeline/qa_score.py --session "$N" --note "$NOTE" | head -1
