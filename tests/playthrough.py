#!/usr/bin/env python3
"""Plays every card end-to-end in a real browser (Playwright/Chromium, phone viewport).

For each card: open #<id>, press Play, answer until the reveal panel appears.
Reports cards that fail to reach the reveal, console errors, horizontal overflow,
and time-to-first-card. Writes qa/playthrough.json. Optional screenshots: --shots DIR.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8799


def play_card(page, cid):
    sec = page.locator(f'section.qlip[data-id="{cid}"]')
    sec.locator(".play-btn").click()
    for _ in range(40):
        if sec.locator(".reveal").count():
            return True
        game = sec.locator(".game")
        for sel in [".scale button", ".opts .opt:not([disabled])", ".swipe-btns button", ".order-pool button",
                    "button.btn:not([hidden])"]:
            loc = game.locator(sel)
            if loc.count():
                # choose a middle-ish option so venn/spectrum paths vary
                n = loc.count()
                target = loc.nth(min(n - 1, (hash(cid) % n)))
                if target.is_visible() and target.is_enabled():
                    target.click()
                    break
        page.wait_for_timeout(1200 if sec.locator(".swipe-stage").count() else 120)
    return sec.locator(".reveal").count() > 0


def main():
    shots = None
    if "--shots" in sys.argv:
        shots = Path(sys.argv[sys.argv.index("--shots") + 1]); shots.mkdir(parents=True, exist_ok=True)
    cards = json.loads((ROOT / "data" / "qlip.json").read_text())["cards"]
    server = subprocess.Popen(["node", str(ROOT / "tests" / "serve.mjs"), str(PORT)], stdout=subprocess.DEVNULL)
    time.sleep(0.8)
    report = {"cards": len(cards), "failed": [], "console_errors": [], "overflow": [], "first_card_ms": None}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.on("console", lambda m: m.type == "error" and report["console_errors"].append(m.text))
            page.on("pageerror", lambda e: report["console_errors"].append(str(e)))
            t0 = time.time()
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_selector("section.qlip .hook")
            report["first_card_ms"] = int((time.time() - t0) * 1000)
            first = page.locator("section.qlip").first.get_attribute("data-id")
            report["first_card"] = first
            if shots:
                page.screenshot(path=str(shots / "00-feed.png"))
            for i, c in enumerate(cards):
                page.goto(f"http://localhost:{PORT}/#{c['id']}")
                page.reload()
                page.wait_for_selector(f'section.qlip[data-id="{c["id"]}"] .hook')
                ok = False
                try:
                    ok = play_card(page, c["id"])
                except Exception as e:  # noqa: BLE001
                    report["console_errors"].append(f"{c['id']}: {e}")
                if not ok:
                    report["failed"].append(c["id"])
                if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                    report["overflow"].append(c["id"])
                if shots and i < 12:
                    page.locator(f'section.qlip[data-id="{c["id"]}"]').screenshot(path=str(shots / f"{i+1:02d}-{c['id']}.png"))
            # accessibility: axe-core on the played feed card, tracks and map, in both colour schemes
            axe = (ROOT / "tests" / "node_modules" / "axe-core" / "axe.min.js").read_text()
            report["a11y"] = []
            for scheme in ("dark", "light"):
                page.emulate_media(color_scheme=scheme)
                for v in ("feed", "tracks", "map"):
                    page.click(f"#tab-{v}")
                    page.wait_for_timeout(500)
                    if shots:
                        page.screenshot(path=str(shots / f"view-{v}-{scheme}.png"))
                    page.add_script_tag(content=axe)
                    res = page.evaluate("""async () => (await axe.run(document, {resultTypes:['violations']})).violations
                        .filter(v => v.impact === 'serious' || v.impact === 'critical')
                        .map(v => ({id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ')}))""")
                    for r in res:
                        r["view"] = f"{v}/{scheme}"
                    report["a11y"] += res
            browser.close()
    finally:
        server.terminate()
    report["played_ok"] = report["cards"] - len(report["failed"])
    (ROOT / "qa" / "playthrough.json").write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ("cards", "played_ok", "failed", "overflow", "first_card_ms")}),
          f"console_errors={len(report['console_errors'])}", f"a11y_serious={len(report.get('a11y', []))}")
    for a in report.get("a11y", []):
        print("   a11y", a)
    for e in report["console_errors"][:10]:
        print("  ", e[:200])


if __name__ == "__main__":
    main()
