# Qlip on iPhone

The iPhone app is a native shell (Capacitor 7, Swift Package Manager) around the same web app GitHub Pages serves.
The site stays the single source of truth: `native/sync-web.sh` copies `index.html`, `app.js`, `styles.css`,
`assets/` and `data/qlip.json` into the app bundle.

## What the app adds over the website
- **Works offline.** All games ship inside the app.
- **Picks up new cards by itself.** When online it loads the latest `data/qlip.json` from the site (3-second timeout, then the bundled copy). The daily content loops reach the app with no App Store update, because only content changes, not code.
- **Haptics.** A light tap when a game finishes, and a success buzz on a right answer.
- **Daily nudge.** An opt-in local notification at 7 pm, switched on and off in About ("i"). It needs no server and no account.
- **Native share sheet** for cards and for the map image.
- Portrait only, dark status bar, app icon and splash screen made from `assets/icon.svg`.

## Folder
```
native/
  package.json, capacitor.config.json   appId com.qumni.qlip, name "Qlip"
  sync-web.sh                           copies the site into www/
  resources/icon.png, splash.png        1024 px icon, 2732 px splash (no alpha)
  ios/App/App.xcodeproj                 the Xcode project (bundle id com.qumni.qlip, iPhone only, iOS 14+)
```

## Run it (one-time setup on this Mac)
1. Install **Xcode** from the Mac App Store. It's about 15 GB and needs your Apple ID.
2. In Terminal: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Then open Xcode once to accept the licence.
3. `cd native && npm install && npm run sync && npm run open` opens the project in Xcode.
4. Choose an iPhone simulator and press ▶.

**On your own iPhone, free:** in Xcode, sign in with your Apple ID (Settings → Accounts) and pick it as the
Team under Signing & Capabilities. Plug in the phone and press ▶. A free Apple ID install expires after 7 days, so
you'd need to re-run it after that.

## Publish to the App Store
| Step | Who | Cost / time |
|---|---|---|
| Apple Developer Program | you (identity check) | $99/year, 1–2 days |
| App Store Connect listing: name "Qlip", subtitle, description, keywords, category Education | can be drafted for you | 1 hour |
| Privacy policy URL ("we collect nothing") and the privacy label "Data Not Collected" | can be drafted for you | — |
| Screenshots at 6.9" (1320×2868) | generated from the simulator | — |
| Age rating: about 12+ (mentions stress and low mood, includes a helpline link) | questionnaire | 10 min |
| Archive and upload (Xcode → Product → Archive) | needs Xcode plus your signing | 15 min |
| Apple review | Apple | usually 1–3 days |

**Review risks and how the app answers them:**
- *4.2 Minimum functionality* (an app that is "just a website"): the app works offline and adds haptics, local reminders, the native share sheet, and progress stored on the device.
- *1.4.1 Health claims*: the About screen states "for learning, not a diagnosis or therapy", sensitive cards link to findahelpline.com, and the validator blocks words like "cure" and "guaranteed".

## Updating the app
- **Content (daily):** no action needed. The app loads new cards from the site.
- **Code or design changes:** `cd native && npm run sync`, then bump the version in Xcode, Archive and upload.
