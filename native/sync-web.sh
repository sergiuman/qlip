#!/bin/sh
# Copy the static site (the same files GitHub Pages serves) into www/ for the iOS bundle.
set -e
cd "$(dirname "$0")"
rm -rf www && mkdir -p www/data
cp ../index.html ../app.js ../styles.css ../manifest.json www/
cp -R ../assets www/
cp ../data/qlip.json www/data/
echo "www/ ready: $(du -sh www | cut -f1)"
