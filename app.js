/* Qlip — a vertical feed of 30-second games about the models that run your life.
   Data: data/qlip.json (built from content/ by pipeline/build.py). State: localStorage only. */
(() => {
  "use strict";

  // ---------- state ----------
  const KEY = "qlip.v1";
  const blank = () => ({ seen: {}, done: {}, liked: {}, profile: {}, commits: {}, streak: { last: "", n: 0 }, trail: [] });
  const S = (() => {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return blank(); }
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: progress lives in memory */ } };

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const hash = (str) => { let x = 2166136261; for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967295; };
  const today = () => new Date().toISOString().slice(0, 10);
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200); };
  const SCALE = ["Not at all", "A little", "Somewhat", "Mostly", "Totally"];
  const SESSION = String(Math.floor(Date.now() / 36e5)); // reshuffles hourly, stable while you scroll

  // ---------- data ----------
  let DB, CARD = {}, CONCEPT = {}, DOMAIN = {}, BY_CONCEPT = {}, NEIGH = {};
  const indexData = (db) => {
    DB = db;
    db.domains.forEach((d) => (DOMAIN[d.id] = d));
    db.concepts.forEach((c) => { CONCEPT[c.id] = c; NEIGH[c.id] = NEIGH[c.id] || []; });
    db.cards.forEach((c) => { CARD[c.id] = c; (BY_CONCEPT[c.concept] = BY_CONCEPT[c.concept] || []).push(c.id); });
    for (const c of db.concepts) for (const l of c.links || []) {
      NEIGH[c.id].push({ id: l.to, type: l.type, dir: "out" });
      (NEIGH[l.to] = NEIGH[l.to] || []).push({ id: c.id, type: l.type, dir: "in" });
    }
  };

  // ---------- recommender (graph walk + novelty + balance) ----------
  const EDGE_WORD = { BUILDS_ON: "builds on", AMPLIFIES: "amplifies", CONTRASTS: "pulls against", REMEDIES: "is a fix for", PART_OF: "is part of", RELATED: "connects to" };
  const reasons = {};
  const FILLER = new Set("your that with what this have from they them when will just about would could there their more than been into does like make most only some then time want were".split(" "));
  const storyWords = (c) => new Set((`${c.hook} ${c.title} ${c.game.prompt || c.game.question || c.game.steps?.[0]?.scenario || ""}`.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !FILLER.has(w)));
  function sameStory(a, b) {
    const A = storyWords(a), B = storyWords(b);
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n / Math.max(1, Math.min(A.size, B.size)) > 0.25;
  }
  function recommend(queue, n) {
    const inQueue = new Set(queue);
    const played = Object.keys(S.done).length;
    const recent = S.trail.slice(-3);
    const near = new Map();
    recent.forEach((cid, i) => (NEIGH[cid] || []).forEach((nb) => {
      const w = 1 + i * 0.5;
      if (!near.has(nb.id) || near.get(nb.id).w < w) near.set(nb.id, { w, from: cid, type: nb.type, dir: nb.dir });
    }));
    for (const id of recent) for (const cardId of BY_CONCEPT[id] || []) if (!S.done[cardId]) near.set(id, near.get(id) || { w: 1.2, from: id, type: "SAME", dir: "out" });
    const picks = [];
    for (let k = 0; k < n; k++) {
      const lastDomains = queue.concat(picks).slice(-4).map((id) => CARD[id].domain);
      let best = null, bestScore = -Infinity;
      const prev = CARD[queue.concat(picks).slice(-1)[0]];
      for (const c of DB.cards) {
        if (inQueue.has(c.id) || picks.includes(c.id)) continue;
        if (prev && sameStory(prev, c)) continue;
        let s = 0;
        if (S.done[c.id]) s -= 6;
        s -= (S.seen[c.id] || 0) * 1.5;
        const nb = near.get(c.concept);
        if (nb) s += 2.5 * nb.w;
        s -= 1.4 * lastDomains.filter((d) => d === c.domain).length;
        s -= Math.max(0, c.level - (1 + played / 6)) * 1.5;
        s += (CONCEPT[c.concept]?.rank || 0) * 25;
        s += hash(c.id + SESSION) * 1.6;
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (!best) break;
      picks.push(best.id);
      const nb = near.get(best.concept);
      if (nb && nb.type !== "SAME" && CONCEPT[nb.from]) {
        const [a, b] = nb.dir === "out" ? [CONCEPT[nb.from].name, CONCEPT[best.concept].name] : [CONCEPT[best.concept].name, CONCEPT[nb.from].name];
        reasons[best.id] = `Because you played “${CONCEPT[nb.from].name}”: ${a} ${EDGE_WORD[nb.type] || "connects to"} ${b}.`;
      } else if (nb) {
        reasons[best.id] = "Another angle on an idea you just played.";
      } else {
        reasons[best.id] = `Something new from ${DOMAIN[best.domain].name}, to keep your map balanced.`;
      }
    }
    return picks;
  }

  // ---------- feed ----------
  const feed = $("#view-feed");
  let queue = [];
  let activeEl = null;

  function appendCards(ids) {
    for (const id of ids) { queue.push(id); feed.append(renderCard(CARD[id])); }
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || e.intersectionRatio < 0.6) continue;
      const el = e.target;
      activeEl = el;
      document.documentElement.style.setProperty("--accent", el.style.getPropertyValue("--c"));
      const id = el.dataset.id;
      if (!id) continue;
      if (!el.dataset.counted) { el.dataset.counted = "1"; S.seen[id] = (S.seen[id] || 0) + 1; save(); }
      const idx = queue.indexOf(id);
      if (idx >= queue.length - 3) appendCards(recommend(queue, 4));
    }
  }, { root: feed, threshold: [0.6] });

  function renderCard(card) {
    const d = DOMAIN[card.domain], concept = CONCEPT[card.concept];
    const el = h("section", { class: "qlip", "data-id": card.id, id: card.id, style: `--c:${d.color}`, "aria-label": card.title });
    const body = h("div", { class: "qlip-body" });
    const game = h("div", { class: "game", hidden: true });
    const play = h("button", { class: "play-btn", onclick: () => start() }, "Play", h("span", { "aria-hidden": "true" }, "→"));
    body.append(
      h("div", { class: "meta-row" },
        h("span", { class: "chip" }, `${d.emoji} ${d.name} · ${["", "Quick one", "Bit deeper", "Deep dive"][card.level]}`)),
      h("h2", { class: "hook" }, card.hook),
      h("p", { class: "concept-line" }, reasons[card.id] || concept.line),
      play, h("p", { class: "teaser" }, teaser(card)), game,
      h("div", { class: "swipe-hint" }, "Swipe up for the next one"));
    const liked = !!S.liked[card.id];
    const likeBtn = h("button", { "aria-label": "Save", "aria-pressed": String(liked), onclick: (ev) => {
      const on = !S.liked[card.id];
      if (on) S.liked[card.id] = Date.now(); else delete S.liked[card.id];
      ev.currentTarget.setAttribute("aria-pressed", String(on)); save(); toast(on ? "Saved to your map" : "Removed");
    } }, "♥");
    const shareBtn = h("button", { "aria-label": "Share", onclick: () => share(card) }, "↗");
    const whyBtn = h("button", { "aria-label": "Why am I seeing this?", onclick: () => toast(reasons[card.id] || `From ${d.name}: ${d.tagline}.`) }, "?");
    const aboutBtn = h("button", { "aria-label": "About Qlip", onclick: () => $("#about").showModal() }, "i");
    const cap = (btn, label) => h("div", { class: "rail-item" }, btn, h("small", { "aria-hidden": "true" }, label));
    el.append(body, h("aside", { class: "rail" }, cap(likeBtn, "Save"), cap(shareBtn, "Share"), cap(whyBtn, "Why this"), cap(aboutBtn, "About")));

    function start() {
      el.classList.add("playing");
      game.hidden = false;
      game.replaceChildren(GAMES[card.type](card, (result) => finish(result)));
      game.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function finish(result = {}) {
      S.done[card.id] = Date.now();
      S.trail = S.trail.concat(card.concept).slice(-20);
      lastResult[card.id] = result.name;
      if (result.profile) S.profile[card.id] = { label: result.name, title: card.title, concept: card.concept, at: Date.now() };
      bumpStreak(); save();
      game.append(renderReveal(card, result, start));
      playedThisVisit++;
      if (playedThisVisit % 5 === 0) el.after(renderBreak());
      // refresh the not-yet-seen tail so the next cards follow the graph from here
      const idx = queue.indexOf(card.id);
      const tail = queue.slice(idx + 1).filter((id) => !feed.querySelector(`[data-id="${CSS.escape(id)}"]`)?.dataset.counted);
      for (const id of tail) { feed.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove(); queue.splice(queue.indexOf(id), 1); }
      appendCards(recommend(queue, 4));
    }
    io.observe(el);
    return el;
  }

  const TYPE_LABEL = { venn: "Find your spot on the diagram", spectrum: "Slide yourself along the scale", radar: "Draw your shape", swipe: "Sort the cards",
    choice: "Make the call", order: "Put it in order", estimate: "Guess the number", reveal: "A thought experiment" };
  function teaser(card) {
    const g = card.game;
    const steps = (g.questions || g.items || g.steps || g.choices || [1]).length;
    const secs = Math.max(15, Math.round((steps * 6 + 15) / 5) * 5);
    return `${TYPE_LABEL[card.type]} · ~${secs}s`;
  }

  // Reveal = punchline first: result, the model, one thing to try, one "next" button. Depth sits behind "Why?".
  function renderReveal(card, result, replay) {
    const wrap = h("div", { class: "reveal", "aria-live": "polite" });
    if (result.name) wrap.append(h("p", { class: "result-name" }, result.profile ? h("small", {}, "Right now you lean") : null, result.name));
    if (result.tally) wrap.append(h("p", { class: "small muted", style: "margin:0" }, result.tally));
    if (result.text) wrap.append(h("p", { style: "margin:0" }, result.text));
    if (result.profile) wrap.append(h("p", { class: "small muted", style: "margin:0" }, "A snapshot of today's answers, not a verdict on you. People move."));
    wrap.append(h("p", { class: "model-line" }, h("small", {}, "The model"), card.model));
    if (card.from_source) wrap.append(h("blockquote", { class: "primary" }, h("p", {}, `“${card.from_source.quote}”`),
      h("footer", {}, card.from_source.cite, card.from_source.next_read ? h("span", {}, ` · Read next: ${card.from_source.next_read}`) : null)));
    const cbId = `try-${card.id}`;
    const cb = h("input", { type: "checkbox", id: cbId, checked: !!S.commits[card.id], onchange: (e) => {
      if (e.target.checked) { S.commits[card.id] = { text: card.try_today, at: Date.now() }; toast("Added to your map. Small steps count."); }
      else delete S.commits[card.id];
      save();
    } });
    wrap.append(h("div", { class: "try" }, cb, h("label", { for: cbId }, h("b", {}, "Try today"), card.try_today)));
    if (card.try_team) wrap.append(h("p", { class: "team-line" }, h("b", {}, "👥 With others: "), card.try_team));
    const targets = card.related.map((cid) => [cid, (BY_CONCEPT[cid] || []).filter((id) => !sameStory(card, CARD[id])).find((id) => !S.done[id]) || (BY_CONCEPT[cid] || []).find((id) => !sameStory(card, CARD[id]))]).filter(([cid, t]) => t && CONCEPT[cid]);
    if (targets.length) {
      const [cid, t] = targets[0];
      const hook = card.sensitive || CARD[t].sensitive ? CONCEPT[cid].line : CARD[t].hook.length > 52 ? CARD[t].hook.slice(0, 50).replace(/\s+\S*$/, "") + "…" : CARD[t].hook;
      wrap.append(h("button", { class: "btn next-up", onclick: () => jumpTo(t) }, h("small", {}, `Next · ${CONCEPT[cid].name}`), `${hook}\u00a0→`));
    }
    const ev = { strong: "Strong evidence", moderate: "Moderate evidence", contested: "Contested — read critically", philosophy: "Philosophical lens" }[card.evidence];
    const more = h("details", { class: "why" }, h("summary", {}, "Why? · 15-second read"),
      h("p", {}, card.insight),

      h("div", { class: "meta-row" }, h("span", { class: `chip plain ev-${card.evidence}` }, ev),
        h("span", { class: "src" }, `${card.source.thinkers.join(", ")} · ${card.source.work}`)));
    if (targets.length > 1) more.append(h("div", { class: "related" }, targets.slice(1).map(([cid, t]) =>
      h("button", { onclick: () => jumpTo(t) }, h("span", {}, DOMAIN[CONCEPT[cid].domain].name), CONCEPT[cid].name))));
    wrap.append(more);
    if (card.sensitive) wrap.append(h("p", { class: "sens" }, "This is for reflection, not diagnosis. If things feel heavy, talk to someone you trust or find free support at ",
      h("a", { href: "https://findahelpline.com", target: "_blank", rel: "noopener" }, "findahelpline.com"), "."));
    wrap.append(h("button", { class: "replay", onclick: replay }, "Play again"));
    return wrap;
  }

  // A natural stopping point: Qlip teaches how endless feeds hook us, so it offers the exit itself.
  let playedThisVisit = 0;
  function renderBreak() {
    const commits = Object.values(S.commits).filter((c) => !c.done).slice(-3);
    const el = h("section", { class: "qlip break-card", style: "--c:var(--good)", "aria-label": "Break" },
      h("div", { class: "qlip-body" },
        h("h2", { class: "hook" }, `Nice. ${playedThisVisit} ideas played.`),
        h("p", { class: "concept-line" }, "Stopping here is a win too. The ideas stick better when you use one than when you scroll ten more."),
        commits.length ? h("ul", { class: "commit-list" }, commits.map((c) => h("li", {}, c.text))) : h("p", { class: "muted" }, "Pick one thing you'd like to try before tomorrow."),
        h("div", { class: "swipe-btns" },
          h("button", { onclick: () => showView("map") }, "I'm done for now"),
          h("button", { onclick: () => el.nextElementSibling?.scrollIntoView({ behavior: "smooth" }) }, "One more"))));
    return el;
  }

  function jumpTo(id) {
    showView("feed");
    let el = feed.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) {
      const cur = activeEl ? queue.indexOf(activeEl.dataset.id) : -1;
      queue.splice(cur + 1, 0, id);
      el = renderCard(CARD[id]);
      const after = activeEl ? activeEl.nextSibling : feed.firstChild;
      feed.insertBefore(el, after);
    }
    el.scrollIntoView({ behavior: "smooth" });
  }

  const lastResult = {};
  async function share(card) {
    const url = `${location.origin}${location.pathname}#${card.id}`;
    const r = lastResult[card.id];
    const text = r ? `I got “${r}” on “${card.title}”. ${card.hook}` : `${card.hook} — a 30-second game on Qlip`;
    try { if (navigator.share) { await navigator.share({ title: card.title, text, url }); return; } } catch { /* user cancelled */ }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url); }
  }

  function bumpStreak() {
    const t = today();
    if (S.streak.last === t) return;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    S.streak.n = S.streak.last === y ? S.streak.n + 1 : 1;
    S.streak.last = t;
    $("#streak-n").textContent = S.streak.n;
    if (S.streak.n > 1) toast(`${S.streak.n}-day streak`);
  }

  // ---------- games ----------
  // Each game renders into a node and calls done({name, text, profile}) once.
  const SCALE4 = ["Not really", "A bit", "Mostly", "Totally"];
  function rated(questions, onAnswer, onEnd, label, scale = SCALE) {
    const box = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
    let i = 0;
    const step = () => {
      if (i >= questions.length) { box.replaceChildren(); onEnd(); return; }
      const q = questions[i];
      box.replaceChildren(
        h("span", { class: "q-count" }, `${i + 1} / ${questions.length}${label ? " · " + label : ""}`),
        h("p", { class: "q-text" }, q.q),
        h("div", { class: "scale", role: "group", "aria-label": "Rate from not at all to totally", style: `grid-template-columns:repeat(${scale.length},minmax(0,1fr))` },
          scale.map((s, v) => h("button", { onclick: () => { onAnswer(q, v / (scale.length - 1)); i++; step(); } }, s))));
    };
    step();
    return box;
  }

  const VENN3 = { W: [124, 112], S: [196, 112], O: [160, 174] };
  function vennGeometry(keys) {
    const r = keys.length === 3 ? 76 : 82;
    const centers = {};
    if (keys.length === 3) keys.forEach((k, i) => (centers[k] = Object.values(VENN3)[i]));
    else { centers[keys[0]] = [118, 140]; centers[keys[1]] = [202, 140]; }
    const inside = (x, y) => keys.filter((k) => (x - centers[k][0]) ** 2 + (y - centers[k][1]) ** 2 <= r * r).sort().join("");
    const acc = {};
    for (let x = 0; x <= 320; x += 4) for (let y = 0; y <= 290; y += 4) {
      const reg = inside(x, y); if (!reg) continue;
      const a = (acc[reg] = acc[reg] || [0, 0, 0]); a[0] += x; a[1] += y; a[2]++;
    }
    const anchors = { "": [36, 262] };
    for (const [k, a] of Object.entries(acc)) anchors[k] = [a[0] / a[2], a[1] / a[2]];
    const g = keys.reduce((p, k) => [p[0] + centers[k][0] / keys.length, p[1] + centers[k][1] / keys.length], [0, 0]);
    return { r, centers, anchors, g, regionAt: inside };
  }

  const GAMES = {
    venn(card, done) {
      const g = card.game, keys = g.axes.map((a) => a.key), th = g.threshold ?? 0.55;
      const geo = vennGeometry(keys);
      const sums = {}, counts = {}, circles = {};
      const view = svg("svg", { viewBox: "0 0 320 290", class: "viz", role: "img", "aria-label": "Venn diagram of your position" });
      g.axes.forEach((a) => {
        const [cx, cy] = geo.centers[a.key];
        const circ = svg("circle", { cx, cy, r: geo.r, fill: a.color || "currentColor", "fill-opacity": 0.12, stroke: a.color || "currentColor", "stroke-width": 2.5, style: "transition: fill-opacity .6s, stroke-opacity .6s" });
        circles[a.key] = circ; view.append(circ);
        const dx = cx - geo.g[0], dy = cy - geo.g[1], len = Math.hypot(dx, dy) || 1;
        const lx = cx + (dx / len) * (geo.r * 0.62), ly = cy + (dy / len) * (geo.r * 0.62) + 5;
        const t = svg("text", { x: lx, y: ly, "text-anchor": "middle", "font-size": 14 }); t.textContent = a.label.split(" (")[0]; view.append(t);
      });
      const dot = svg("circle", { class: "dot", cx: geo.g[0], cy: geo.g[1], r: 9, fill: "var(--fg)", stroke: "var(--bg)", "stroke-width": 3, opacity: 0 });
      view.append(dot);
      const live = h("p", { class: "small muted", style: "margin:0;text-align:center", "aria-live": "polite" }, "Answer to place yourself on the map.");
      const scores = () => Object.fromEntries(keys.map((k) => [k, counts[k] ? sums[k] / counts[k] : null]));
      const regionOf = (sc) => keys.filter((k) => sc[k] != null && sc[k] >= th).sort().join("");
      const move = () => {
        const sc = scores(), reg = regionOf(sc);
        keys.forEach((k) => { if (sc[k] == null) return; circles[k].setAttribute("fill-opacity", (0.05 + 0.4 * sc[k]).toFixed(2)); circles[k].setAttribute("stroke-opacity", (0.35 + 0.65 * sc[k]).toFixed(2)); });
        let [x, y] = geo.anchors[reg] || geo.anchors[""];
        keys.forEach((k) => { if (sc[k] == null) return; const [cx, cy] = geo.centers[k]; x += (cx - geo.g[0]) * (sc[k] - 0.5) * 0.18; y += (cy - geo.g[1]) * (sc[k] - 0.5) * 0.18; });
        if (geo.regionAt(x, y) !== reg) [x, y] = geo.anchors[reg] || geo.anchors[""];
        dot.setAttribute("cx", x.toFixed(1)); dot.setAttribute("cy", y.toFixed(1)); dot.setAttribute("opacity", 1);
        const r = g.results[reg]; if (r) live.textContent = `Right now: ${r.name}`;
      };
      const qs = rated(g.questions, (q, v) => {
        const val = q.invert ? 1 - v : v;
        sums[q.axis] = (sums[q.axis] || 0) + val; counts[q.axis] = (counts[q.axis] || 0) + 1; move();
      }, () => {
        const sc = scores(), reg = regionOf(sc);
        const undecided = keys.every((k) => sc[k] != null && Math.abs(sc[k] - 0.5) <= 0.13);
        const r = undecided
          ? g.results.mid || { name: "Right on the fence", text: "Every answer landed in the middle, so the map can't find your gap yet. Pick one specific goal (\"run 5 km\", \"learn 3 guitar chords\") and play again with that in mind." }
          : g.results[reg] || { name: "", text: "" };
        if (undecided) { dot.setAttribute("cx", geo.g[0].toFixed(1)); dot.setAttribute("cy", geo.g[1].toFixed(1)); }
        const bars = keys.map((k) => `${g.axes.find((a) => a.key === k).label} ${Math.round((sc[k] ?? 0) * 10)}/10`).join(" · ");
        live.textContent = bars;
        done({ name: r.name, text: r.text, profile: !undecided });
      }, "", SCALE4);
      return h("div", {}, view, live, qs);
    },

    spectrum(card, done) {
      const g = card.game, vals = [];
      const mark = h("div", { class: "spec-mark", style: "left:50%;opacity:.35" });
      const spec = h("div", {}, h("div", { class: "spec-ends" }, h("span", {}, g.left), h("span", {}, g.right)),
        h("div", { class: "spec", role: "img", "aria-label": `Scale from ${g.left} to ${g.right}` }, h("div", { class: "spec-bar" }), mark));
      const box = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
      const pos = () => vals.reduce((a, b) => a + b, 0) / vals.length / 2; // -1..1
      let i = 0;
      const step = () => {
        if (i >= g.questions.length) {
          const p = pos(), z = g.zones.find((z) => p <= z.upTo) || g.zones[g.zones.length - 1];
          box.replaceChildren(); done({ name: z.label, text: z.text, profile: true }); return;
        }
        const q = g.questions[i];
        box.replaceChildren(h("span", { class: "q-count" }, `${i + 1} / ${g.questions.length}`), h("p", { class: "q-text" }, q.q),
          h("div", { class: "opts" }, q.options.map((o) => h("button", { class: "opt", onclick: () => {
            vals.push(o.value); i++;
            mark.style.left = `${((pos() + 1) / 2) * 100}%`; mark.style.opacity = 1; step();
          } }, o.label))));
      };
      step();
      return h("div", { style: "display:flex;flex-direction:column;gap:12px" }, spec, box);
    },

    radar(card, done) {
      const g = card.game, n = g.axes.length, sums = Array(n).fill(0), counts = Array(n).fill(0);
      const C = 150, R = 92;
      const view = svg("svg", { viewBox: "-50 -10 400 320", class: "viz", role: "img", "aria-label": "Radar chart of your answers" });
      const pt = (i, f) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f]; };
      [0.25, 0.5, 0.75, 1].forEach((f) => view.append(svg("polygon", { points: g.axes.map((_, i) => pt(i, f).join(",")).join(" "), fill: "none", stroke: "var(--line)" })));
      g.axes.forEach((a, i) => {
        const [x, y] = pt(i, 1.0); view.append(svg("line", { x1: C, y1: C, x2: x, y2: y, stroke: "var(--line)" }));
        const [lx, ly] = pt(i, 1.24);
        const t = svg("text", { x: lx, y: ly + 4, "text-anchor": Math.abs(lx - C) < 8 ? "middle" : lx > C ? "start" : "end", "font-size": 11, class: "lbl-muted" });
        t.textContent = a; view.append(t);
      });
      const poly = svg("polygon", { points: g.axes.map((_, i) => pt(i, 0.04).join(",")).join(" "), fill: "var(--c)", "fill-opacity": 0.35, stroke: "var(--c)", "stroke-width": 2.5, style: "transition: all .6s" });
      view.append(poly);
      const avg = (i) => (counts[i] ? sums[i] / counts[i] / 4 : 0);
      const draw = () => poly.setAttribute("points", g.axes.map((_, i) => pt(i, Math.max(0.04, avg(i))).join(",")).join(" "));
      const qs = rated(g.questions, (q, v) => { sums[q.axis] += v * 4; counts[q.axis]++; draw(); }, () => {
        let lo = 0, hi = 0; for (let i = 1; i < n; i++) { if (avg(i) < avg(lo)) lo = i; if (avg(i) > avg(hi)) hi = i; }
        const even = avg(hi) - avg(lo) < 0.13, low = avg(hi) < 0.3;
        done(low ? { name: "Low on all of them today", text: "That happens after a hard stretch, and it passes. Start with the smallest possible step today, and play this again next week to see what moved.", profile: true }
          : even ? { name: "Even across the board", text: "No single gap stands out today. Pick the axis that matters most to you this week and give it ten minutes.", profile: true }
          : { name: `Strongest: ${g.axes[hi]}. Room to grow: ${g.axes[lo]}.`, text: g.advice[String(lo)], profile: true });
      });
      return h("div", { style: "display:flex;flex-direction:column;gap:12px" }, view, qs);
    },

    swipe(card, done) {
      const g = card.game; let i = 0, right = 0; const log = [];
      const stage = h("div", { class: "swipe-stage" });
      const fb = h("p", { class: "feedback", hidden: true });
      const score = h("span", { class: "swipe-score" });
      const btns = h("div", { class: "swipe-btns" },
        h("button", { onclick: () => pick("left") }, "← ", g.left), h("button", { onclick: () => pick("right") }, g.right, " →"));
      const show = () => {
        score.textContent = `${i + 1} / ${g.items.length}`;
        const c = h("div", { class: "swipe-card" }, g.items[i].text);
        let x0 = null, dx = 0;
        c.addEventListener("pointerdown", (e) => { x0 = e.clientX; c.setPointerCapture(e.pointerId); });
        c.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = e.clientX - x0; c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; });
        c.addEventListener("pointerup", () => { if (Math.abs(dx) > 70) pick(dx < 0 ? "left" : "right"); else c.style.transform = ""; x0 = null; dx = 0; });
        stage.replaceChildren(c);
      };
      let locked = false;
      const pick = (side) => {
        if (locked) return; locked = true;
        const it = g.items[i], ok = it.side === side;
        if (ok) right++;
        const c = stage.firstChild; c.style.transform = `translateX(${side === "left" ? -120 : 120}%) rotate(${side === "left" ? -12 : 12}deg)`; c.style.opacity = 0;
        const label = it.side === "left" ? g.left : g.right;
        log.push({ it, ok, label });
        fb.hidden = false; fb.classList.toggle("miss", !ok);
        fb.textContent = ok ? `✓ ${it.why}` : `Plot twist: this one is “${label}”. ${it.why}`;
        setTimeout(() => {
          i++; locked = false;
          if (i >= g.items.length) {
            btns.remove(); stage.remove(); fb.remove();
            const n = g.items.length, misses = log.filter((x) => !x.ok);
            const recap = h("ul", { class: "recap" }, log.slice().sort((a, b) => a.ok - b.ok).map((x) =>
              h("li", { class: x.ok ? "ok" : "miss" }, h("span", { "aria-hidden": "true" }, x.ok ? "✓" : "↺"),
                h("div", {}, h("b", {}, x.it.text), h("small", {}, `${x.label}${x.ok ? "" : " · " + x.it.why}`)))));
            score.replaceWith(recap);
            done({ name: right === n ? "Clean sweep." : right >= n * 0.75 ? `${right} of ${n}. Sharp sorting.` : `${right} of ${n}. Here's the pattern.`,
              tally: misses.length ? "The ↺ ones are worth a second look." : "" });
          }
          else show();
        }, 1100);
      };
      show();
      return h("div", { style: "display:flex;flex-direction:column;gap:12px" }, h("p", { class: "q-text" }, g.prompt), score, stage, btns, fb);
    },

    choice(card, done) {
      const g = card.game, box = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
      let i = 0, best = 0; const bestMoves = [];
      const step = () => {
        const s = g.steps[i];
        const fb = h("p", { class: "feedback", hidden: true });
        const next = h("button", { class: "btn next-q", hidden: true, onclick: () => { i++; if (i < g.steps.length) step(); else { next.remove(); const total = g.steps.length;
            done(total < 2 ? { name: "" }
              : best === total ? { name: "You'd coach this one.", tally: `${best}/${total} best calls` }
              : best === 0 ? { name: "Here's another way to play it." }
              : { name: "Good instincts. One more trick below.", tally: `${best}/${total} best calls` });
          } } },
          i + 1 < g.steps.length ? "Next" : "See the model");
        const opts = h("div", { class: "opts" }, s.options.map((o) => h("button", { class: "opt", onclick: (e) => {
          opts.querySelectorAll("button").forEach((b, k) => { b.disabled = true; if (s.options[k].best) b.classList.add("best"); });
          e.currentTarget.classList.add("picked"); if (o.best) best++;
          fb.hidden = false; fb.classList.toggle("miss", !o.best); fb.textContent = o.feedback; next.hidden = false; next.focus();
          if (!o.best) bestMoves.push(s.options.find((x) => x.best).text);
        } }, o.text)));
        box.replaceChildren(g.steps.length > 1 ? h("span", { class: "q-count" }, `${i + 1} / ${g.steps.length}`) : "", h("p", { class: "q-text" }, s.scenario), opts, fb, next);
      };
      step();
      return box;
    },

    order(card, done) {
      const g = card.game, items = g.items;
      let pool = items.map((t, k) => ({ t, k }));
      for (let a = pool.length - 1; a > 0; a--) { const b = Math.floor(hash(card.id + a + SESSION) * (a + 1)); [pool[a], pool[b]] = [pool[b], pool[a]]; }
      if (pool.every((p, k) => p.k === k)) pool.reverse();
      const picked = [];
      const poolEl = h("div", { class: "order-pool" }), pickEl = h("div", { class: "order-picked", "aria-label": "Your order" });
      const check = h("button", { class: "btn", hidden: true, onclick: () => {
        let ok = 0;
        pickEl.querySelectorAll("span").forEach((s, k) => { const good = picked[k].k === k; if (good) ok++; s.classList.add(good ? "ok" : "no"); if (!good) s.append(h("em", {}, ` → step ${picked[k].k + 1}`)); });
        check.remove();
        const correct = h("p", { class: "feedback" }, `Order: ${items.join(" → ")}. ${g.explain}`);
        pickEl.after(correct);
        done({ name: ok === items.length ? "Every step in place." : `${ok} of ${items.length} in place. Now you know the rest.` });
      } }, "Check");
      const draw = () => {
        poolEl.replaceChildren(...pool.map((p) => h("button", { onclick: () => { picked.push(p); pool = pool.filter((x) => x !== p); draw(); } }, p.t)));
        pickEl.replaceChildren(...picked.map((p, k) => h("span", { role: "button", tabindex: 0, onclick: () => { if (check.isConnected) { picked.splice(k, 1); pool.push(p); draw(); } } }, `${k + 1}. ${p.t}`)));
        check.hidden = pool.length > 0;
      };
      draw();
      return h("div", { style: "display:flex;flex-direction:column;gap:12px" }, h("p", { class: "q-text" }, g.prompt),
        h("span", { class: "small muted" }, "Tap in order. Tap a placed item to undo."), pickEl, poolEl, check);
    },

    estimate(card, done) {
      const g = card.game, box = h("div", { class: "est", style: "display:flex;flex-direction:column;gap:12px" });
      const fmt = (v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${g.unit || ""}`;
      const slider = () => {
        const mid = g.anchor != null ? g.anchor : g.min;
        const out = h("div", { class: "est-val" }, "?");
        const rng = h("input", { type: "range", id: `est-${card.id}`, min: g.min, max: g.max, step: g.step || 1, value: mid, "aria-label": "Your estimate", oninput: (e) => { out.textContent = fmt(e.target.value); lock.disabled = false; lock.textContent = "Lock in my guess"; } });
        const lock = h("button", { class: "btn", disabled: true, onclick: () => {
          const guess = Number(rng.value), span = g.max - g.min || 1;
          const pct = (v) => `${((v - g.min) / span) * 100}%`;
          rng.disabled = true; lock.remove();
          const diff = Math.abs(guess - g.answer);
          const off = span <= 10 ? diff / Math.max(1, (g.step || 1) * 4) : diff / Math.max(Math.abs(g.answer), 1e-9);
          const verdict = off < 0.1 ? "Bullseye." : off < 0.3 ? "Close call." : g.typical_miss ? "Most people miss this one." : guess < g.answer ? "Plot twist: it's bigger." : "Plot twist: it's smaller.";
          const truth = h("i", { class: "truth", style: `left:${pct(guess)}` });
          box.append(h("p", { class: "est-verdict" }, verdict),
            h("div", { class: "est-track" }, h("i", { class: "you", style: `left:${pct(guess)}` }), truth),
            h("p", { class: "est-line" }, ...(guess <= g.answer
              ? [h("span", {}, `You: ${fmt(guess)}`), h("b", {}, `Real: ${fmt(g.answer)}`)]
              : [h("b", {}, `Real: ${fmt(g.answer)}`), h("span", {}, `You: ${fmt(guess)}`)])),
            h("p", { class: "feedback" }, g.explain));
          requestAnimationFrame(() => requestAnimationFrame(() => (truth.style.left = pct(g.answer))));
          done({});
        } }, "Drag to make your guess");
        box.append(out, rng, lock);
      };
      box.append(h("p", { class: "q-text" }, g.question));
      if (g.anchor != null) {
        const ask = h("div", { class: "swipe-btns" }, ["Less", "More"].map((w) => h("button", { onclick: () => { ask.remove(); prompt.remove(); slider(); } }, w)));
        const prompt = h("p", { style: "margin:0" }, `First: is it more or less than ${fmt(g.anchor)}?`);
        box.append(prompt, ask);
      } else slider();
      return box;
    },

    reveal(card, done) {
      const g = card.game;
      const has = Number.isInteger(g.answer);
      const opts = h("div", { class: "opts" }, g.choices.map((c, k) => h("button", { class: "opt", onclick: (e) => {
        opts.querySelectorAll("button").forEach((b, j) => { b.disabled = true; if (has && j === g.answer) b.classList.add("best"); });
        e.currentTarget.classList.add("picked");
        done({ name: !has ? "" : k === g.answer ? "Spot on." : "Here's what the research found.", text: g.reveal });
      } }, c)));
      return h("div", { style: "display:flex;flex-direction:column;gap:12px" }, h("p", { class: "q-text" }, g.prompt), opts);
    },
  };

  // ---------- tracks ----------
  function renderTracks() {
    const grid = $("#track-grid");
    grid.replaceChildren(...DB.domains.map((d) => {
      const cards = DB.cards.filter((c) => c.domain === d.id);
      const done = cards.filter((c) => S.done[c.id]).length;
      return h("button", { class: "track", style: `--c:${d.color}`, onclick: () => startTrack(d.id) },
        h("span", { "aria-hidden": "true", style: "font-size:1.4rem" }, d.emoji), h("h3", {}, d.name), h("p", {}, d.tagline),
        h("span", { class: "count" }, `${done} / ${cards.length} played`),
        h("span", { class: "bar" }, h("i", { style: `width:${cards.length ? (done / cards.length) * 100 : 0}%` })));
    }));
  }
  function startTrack(domainId) {
    const ids = DB.cards.filter((c) => c.domain === domainId).sort((a, b) => (!!S.done[a.id] - !!S.done[b.id]) || a.level - b.level).map((c) => c.id);
    ids.forEach((id) => (reasons[id] = `Track: ${DOMAIN[domainId].name}`));
    resetFeed(ids);
    showView("feed");
  }
  function resetFeed(ids) {
    queue = []; feed.replaceChildren(); appendCards(ids); feed.scrollTop = 0;
  }

  // ---------- map (force-directed graph on canvas) ----------
  let sim = null;
  function renderMap() {
    const cv = $("#map-canvas"), ctx = cv.getContext("2d");
    const rect = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = rect.width * dpr; cv.height = rect.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    const plays = {};
    for (const id of Object.keys(S.done)) if (CARD[id]) plays[CARD[id].concept] = (plays[CARD[id].concept] || 0) + 1;
    if (!sim) {
      const doms = DB.domains.map((d) => d.id);
      sim = { nodes: DB.concepts.map((c, i) => {
        const a = (doms.indexOf(c.domain) / doms.length) * Math.PI * 2 + hash(c.id) * 0.5;
        return { id: c.id, x: Math.cos(a) * 0.35 + 0.5 + (hash(c.id + "x") - 0.5) * 0.08, y: Math.sin(a) * 0.35 + 0.5 + (hash(c.id + "y") - 0.5) * 0.08, vx: 0, vy: 0 };
      }) };
      sim.byId = Object.fromEntries(sim.nodes.map((n) => [n.id, n]));
      sim.links = DB.concepts.flatMap((c) => (c.links || []).filter((l) => sim.byId[l.to]).map((l) => [sim.byId[c.id], sim.byId[l.to]]));
      // Domains get a home on a ring; links pull across rooms, repulsion keeps labels readable.
      const home = Object.fromEntries(doms.map((d, i) => { const a = (i / doms.length) * Math.PI * 2; return [d, [0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36]]; }));
      for (let t = 0; t < 500; t++) {
        for (const a of sim.nodes) for (const b of sim.nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 1e-4;
          const f = 0.00035 / d2; a.vx += dx * f; a.vy += dy * f;
        }
        for (const [a, b] of sim.links) { const dx = b.x - a.x, dy = b.y - a.y; a.vx += dx * 0.006; a.vy += dy * 0.006; b.vx -= dx * 0.006; b.vy -= dy * 0.006; }
        for (const n of sim.nodes) {
          const [hx, hy] = home[CONCEPT[n.id].domain];
          n.vx += (hx - n.x) * 0.02; n.vy += (hy - n.y) * 0.02;
          n.x += n.vx; n.y += n.vy; n.vx *= 0.55; n.vy *= 0.55;
        }
      }
      sim.labelled = new Set(DB.concepts.slice().sort((a, b) => b.rank - a.rank).slice(0, 5).map((c) => c.id));
      const xs = sim.nodes.map((n) => n.x), ys = sim.nodes.map((n) => n.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      for (const n of sim.nodes) { n.x = (n.x - x0) / (x1 - x0 || 1); n.y = (n.y - y0) / (y1 - y0 || 1); }
    }
    const css = getComputedStyle(document.documentElement);
    const P = (n) => [24 + n.x * (W - 48), 20 + n.y * (H - 40)];
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (const [a, b] of sim.links) {
      const lit = plays[a.id] && plays[b.id];
      ctx.strokeStyle = lit ? css.getPropertyValue("--fg") : css.getPropertyValue("--line");
      ctx.globalAlpha = lit ? 0.6 : 0.8;
      const [ax, ay] = P(a), [bx, by] = P(b); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    sim.hit = [];
    for (const n of sim.nodes) {
      const c = CONCEPT[n.id], col = DOMAIN[c.domain].color, p = plays[n.id] || 0;
      const [x, y] = P(n), r = 4 + Math.min(p, 4) * 1.5 + c.rank * 40;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = p ? col : css.getPropertyValue("--surface-2"); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = p ? 0 : 1.5; if (!p) ctx.stroke();
      sim.hit.push({ x, y, r: Math.max(r, 12), id: n.id, p, label: c.name });
    }
    sim.topPlayed = new Set(sim.hit.filter((n) => n.p).sort((a, b) => b.p - a.p).slice(0, 8).map((n) => n.id));
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `800 13px ${css.getPropertyValue("--font-display")}`;
    for (const d of DB.domains) {
      const ns = sim.hit.filter((n) => CONCEPT[n.id].domain === d.id); if (!ns.length) continue;
      const cx = ns.reduce((a, n) => a + n.x, 0) / ns.length, cy = Math.min(...ns.map((n) => n.y)) - 14;
      ctx.lineWidth = 4; ctx.strokeStyle = css.getPropertyValue("--surface"); ctx.strokeText(d.name, cx, Math.max(10, cy));
      ctx.fillStyle = d.color; ctx.fillText(d.name, cx, Math.max(10, cy));
    }
    ctx.restore();
    // Labels last, skipping any that would collide with one already drawn.
    const boxes = sim.hit.map((n) => [n.x - n.r * 0.6, n.y - n.r * 0.6, n.x + n.r * 0.6, n.y + n.r * 0.6]);
    ctx.textBaseline = "middle";
    for (const n of sim.hit.slice().sort((a, b) => b.p - a.p)) {
      if (n.p ? !sim.topPlayed.has(n.id) : !sim.labelled.has(n.id)) continue;
      ctx.font = `${n.p ? 700 : 400} 11px ${css.getPropertyValue("--font-body")}`;
      const text = n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label, w = ctx.measureText(text).width;
      let lx = n.x + n.r * 0.6 + 4; if (lx + w > W - 4) lx = n.x - n.r * 0.6 - 4 - w;
      const box = [lx - 2, n.y - 8, lx + w + 2, n.y + 8];
      if (boxes.some((b, k) => (k >= sim.hit.length || sim.hit[k].id !== n.id) && box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.strokeStyle = css.getPropertyValue("--surface");
      ctx.strokeText(text, lx, n.y);
      ctx.fillStyle = n.p ? css.getPropertyValue("--fg") : css.getPropertyValue("--muted");
      ctx.fillText(text, lx, n.y);
    }
    const lit = Object.keys(plays).length;
    const domPlays = {};
    for (const [cid, n] of Object.entries(plays)) domPlays[CONCEPT[cid].domain] = (domPlays[CONCEPT[cid].domain] || 0) + n;
    const top = Object.entries(domPlays).sort((a, b) => b[1] - a[1])[0];
    $("#map-summary").textContent = lit
      ? lit >= DB.concepts.length ? `You've explored all ${lit} ideas. New ones grow into the graph every day.`
      : `You've lit up ${lit} of ${DB.concepts.length} ideas.${top ? ` Most explored: ${DOMAIN[top[0]].name}.` : ""}`
      : `${DB.concepts.length} ideas are waiting. Play any game to light up your first one.`;
    $("#map-legend").replaceChildren(...DB.domains.map((d) => h("span", {}, h("i", { style: `background:${d.color}` }), d.name)));
    const prof = Object.entries(S.profile).sort((a, b) => b[1].at - a[1].at);
    $("#profile-list").replaceChildren(...(prof.length ? prof.map(([id, p]) => h("li", {}, h("b", {}, p.label), h("span", {}, `${p.title} · `, h("a", { href: `#${id}`, onclick: (e) => { e.preventDefault(); jumpTo(id); } }, "play again"))))
      : [h("li", { class: "muted" }, "Play a Venn, Spectrum or Radar game to see where you stand.")]));
    const com = Object.entries(S.commits);
    $("#commit-list").replaceChildren(...(com.length ? com.map(([id, c]) => h("li", {}, h("input", { type: "checkbox", id: `c-${id}`, checked: !!c.done, onchange: (e) => { c.done = e.target.checked; save(); } }), h("label", { for: `c-${id}` }, c.text)))
      : [h("li", { class: "muted" }, "Tick “Try today” on any card and it lands here.")]));
  }
  $("#map-canvas").addEventListener("click", (e) => {
    if (!sim?.hit) return;
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = sim.hit.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 <= n.r * n.r);
    if (hit && BY_CONCEPT[hit.id]) jumpTo(BY_CONCEPT[hit.id].find((id) => !S.done[id]) || BY_CONCEPT[hit.id][0]);
  });

  // ---------- views & routing ----------
  function showView(v) {
    for (const name of ["feed", "tracks", "map"]) {
      $(`#view-${name}`).hidden = name !== v;
      $(`#tab-${name}`).setAttribute("aria-selected", String(name === v));
    }
    if (v === "tracks") renderTracks();
    if (v === "map") requestAnimationFrame(renderMap);
  }
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#brand").addEventListener("click", () => { showView("feed"); feed.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#streak").addEventListener("click", () => toast(S.streak.n ? `${S.streak.n}-day streak. One game a day keeps it alive.` : "Finish a game to start your streak."));
  $("#share-map").addEventListener("click", () => {
    $("#map-canvas").toBlob(async (blob) => {
      const file = new File([blob], "my-qlip-map.png", { type: "image/png" });
      try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "My Qlip map", text: $("#map-summary").textContent }); return; } } catch { return; }
      const a = h("a", { href: URL.createObjectURL(blob), download: "my-qlip-map.png" }); document.body.append(a); a.click(); a.remove();
      toast("Map saved as an image");
    });
  });
  $("#reset-btn").addEventListener("click", () => ($("#reset-confirm").hidden = false));
  $("#reset-no").addEventListener("click", () => ($("#reset-confirm").hidden = true));
  $("#reset-yes").addEventListener("click", () => { Object.assign(S, blank()); save(); $("#reset-confirm").hidden = true; $("#streak-n").textContent = 0; renderMap(); toast("Progress cleared"); });
  window.addEventListener("resize", () => { if (!$("#view-map").hidden) renderMap(); });
  document.addEventListener("keydown", (e) => {
    if ($("#view-feed").hidden || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); activeEl?.nextElementSibling?.scrollIntoView({ behavior: "smooth" }); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); activeEl?.previousElementSibling?.scrollIntoView({ behavior: "smooth" }); }
  });

  // ---------- boot ----------
  async function boot() {
    $("#streak-n").textContent = S.streak.n;
    const res = await fetch("data/qlip.json", { cache: "no-cache" });
    indexData(await res.json());
    const tag = decodeURIComponent(location.hash.slice(1));
    if (tag === "map" || tag === "tracks") { resetFeed(firstQueue()); showView(tag); return; }
    if (tag.startsWith("track-") && DOMAIN[tag.slice(6)]) { startTrack(tag.slice(6)); return; }
    const first = firstQueue();
    if (CARD[tag]) { first.splice(first.indexOf(tag), first.includes(tag) ? 1 : 0); first.unshift(tag); }
    resetFeed(first);
  }
  function firstQueue() {
    // New players open on the flagship "where are you" game; returning players get the graph's next steps.
    const start = Object.keys(S.done).length ? [] : ["boredom-signal-estimate", "wso-triad-venn"].filter((id) => CARD[id]);
    return start.concat(recommend(start, 5 - start.length));
  }
  boot().catch((err) => {
    feed.replaceChildren(h("section", { class: "qlip end-card" }, h("div", { class: "qlip-body" }, h("h2", { class: "hook" }, "Couldn't load the games."), h("p", {}, "Check your connection and reload."))));
    console.error(err);
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
