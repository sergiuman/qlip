#!/bin/zsh
# Installs the local 10-day loop. macOS blocks background jobs from reading ~/Desktop, so the loop runs
# in its own clone at ~/qlip-loop and syncs through GitHub.
set -e
LOOP="$HOME/qlip-loop"
[ -d "$LOOP/.git" ] || git clone -q https://github.com/sergiuman/qlip.git "$LOOP"
git -C "$LOOP" pull -q
npm install --prefix "$LOOP/tests" --silent
PLIST="$HOME/Library/LaunchAgents/com.qumni.qlip.daily.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.qumni.qlip.daily</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$LOOP/pipeline/daily.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>15</integer></dict>
  <key>StandardOutPath</key><string>$LOOP/qa/daily.out</string>
  <key>StandardErrorPath</key><string>$LOOP/qa/daily.out</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/com.qumni.qlip.daily" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "daily loop installed in $LOOP"
