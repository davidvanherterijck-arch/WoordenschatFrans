import { gradeFr, gradeNl, stripAccents } from "./grade.js";

/* ───────────── Opslag ───────────── */
const KEY = "frans-oefenen-v1";
const DEFAULT_STATE = () => ({
  settings: { name: "Warre", mode: "written", dir: "nf", sessionSize: 20, tts: true, rate: 0.9 },
  sessionCount: 0,          // aantal gestarte dagsessies (de "sessieklok" voor herhaling)
  items: {},                // "<woordId>|nf" of "|fn"  → statistiek per woord en richting
  days: {},                 // "2026-11-11" → { sessions, cards, correct }
  xp: 0,
  bestRun: 0,
  bestStreak: 0,
  writtenCorrect: 0,
  recovered: 0,             // foute woorden die later toch juist waren
  badges: {},               // id → datum
  reports: [],              // gemelde fouten in de woordenlijst
  seed: Math.floor(Math.random() * 1e9),
  created: new Date().toISOString(),
});

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); const d = DEFAULT_STATE(); return { ...d, ...s, settings: { ...d.settings, ...s.settings } }; }
  } catch (e) { /* privévenster of geblokkeerd */ }
  return DEFAULT_STATE();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Opslaan lukt niet op dit toestel."); }
}

/* ───────────── Woorden ───────────── */
let DATA, byId = {}, themeById = {}, orderedWords = [];
const nlKey = s => stripAccents(s.toLowerCase()).replace(/[?!.]/g, "").replace(/^\s*(de|het|een)\s+/, "").replace(/\s+/g, " ").trim();
const frKeyOf = s => stripAccents(s.toLowerCase()).replace(/\(.*?\)/g, "").replace(/^(un|une|le|la|les|des)\s+|^l'/, "").replace(/[?!.]/g, "").trim();
let nlIndex = new Map(), frIndex = new Map();

async function loadWords() {
  const res = await fetch("words.json", { cache: "no-cache" }).catch(() => fetch("words.json"));
  DATA = await res.json();
  byId = Object.fromEntries(DATA.words.map(w => [w.id, w]));
  themeById = Object.fromEntries(DATA.themes.map(t => [t.id, t]));
  // volgorde van nieuwe woorden: thema's in een vaste, door elkaar geschudde volgorde
  const tOrder = [...DATA.themes].sort((a, b) => hash(a.id + state.seed) - hash(b.id + state.seed)).map(t => t.id);
  orderedWords = [...DATA.words].sort((a, b) => tOrder.indexOf(a.themes[0]) - tOrder.indexOf(b.themes[0]));
  for (const w of DATA.words) {
    for (const p of w.nl.split(",")) { const k = nlKey(p); if (!nlIndex.has(k)) nlIndex.set(k, new Set()); nlIndex.get(k).add(w.id); }
    const fk = frKeyOf(w.fr); if (!frIndex.has(fk)) frIndex.set(fk, new Set()); frIndex.get(fk).add(w.id);
  }
}
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// Andere kaarten met (deels) dezelfde vraag: hun antwoord telt ook als juist.
function siblingsNl(w) { const ids = new Set([w.id]); for (const p of w.nl.split(",")) for (const id of nlIndex.get(nlKey(p)) || []) ids.add(id); return [...ids].map(id => byId[id]); }
function siblingsFr(w) { return [...(frIndex.get(frKeyOf(w.fr)) || [w.id])].map(id => byId[id]); }

/* ───────────── Hulpjes ───────────── */
const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const DIRS = { nf: "Nederlands → Frans", fn: "Frans → Nederlands" };
const dirList = dir => (dir === "mix" ? ["nf", "fn"] : [dir]);
let toastTimer;
function toast(msg, ms = 2600) {
  const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div"); box.className = "confetti";
  const colors = ["#1f4fd1", "#d8323c", "#f2b316", "#1d9a5b", "#ffffff"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw"; p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * .5 + "s"; p.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3200);
}

/* ───────────── Uitspraak ───────────── */
let voice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /^fr[-_]BE/i.test(v.lang)) || vs.find(v => /^fr[-_]FR/i.test(v.lang)) || vs.find(v => /^fr/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const forSpeech = s => s.replace(/\((?:m|f|v)\.?[^)]*\)|\(s\.[vt]\.p\.\)|\(aanspr\.?\)/gi, "").replace(/\.\.\.|…/g, " ").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
function speak(text) {
  if (!state.settings.tts || !("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(forSpeech(text));
  u.lang = voice?.lang || "fr-FR"; if (voice) u.voice = voice; u.rate = state.settings.rate;
  speechSynthesis.speak(u);
}

/* ───────────── Voortgang & herhaling ───────────── */
const itemKey = (wid, dir) => `${wid}|${dir}`;
function item(wid, dir) { return state.items[itemKey(wid, dir)]; }

// Juist → komt niet snel terug.  Fout of bijna → komt terug in één van de 3 volgende sessies, tot het juist is.
function record(card, verdict) {
  const k = itemKey(card.wid, card.dir);
  const it = state.items[k] ||= { s: 0, c: 0, w: 0, a: 0, att: null, last: 0, due: null };
  it.s++; it.last = state.sessionCount; it.d = today();
  if (verdict === "juist") {
    it.c++;
    if (it.att == null) it.att = it.s;
    if (it.due != null) state.recovered++;
    it.due = null;
  } else {
    verdict === "bijna" ? it.a++ : it.w++;
    it.due = state.sessionCount + 1 + Math.floor(Math.random() * 3);
  }
}
// Moeilijk / makkelijk voor Warre
function difficulty(it) {
  if (!it || !it.s) return null;
  const errRate = (it.w + it.a) / it.s;
  if (it.att === 1 && errRate < 0.34) return "makkelijk";
  return "moeilijk";
}

function buildDailySession() {
  const S = state.sessionCount + 1;
  const dirs = dirList(state.settings.dir);
  const size = state.settings.sessionSize;
  const cards = [], used = new Set();
  const add = (wid, dir, why) => { if (used.has(wid) || !byId[wid]) return; used.add(wid); cards.push({ wid, dir, why }); };
  const pending = Object.entries(state.items)
    .filter(([k, v]) => v.due != null && dirs.includes(k.split("|")[1]) && byId[k.split("|")[0]])
    .sort((a, b) => a[1].due - b[1].due);
  // 1. foute woorden die nu terug moeten komen
  for (const [k, v] of pending) { if (cards.length >= size) break; if (v.due <= S) add(...k.split("|"), "terug"); }
  // 2. nieuwe woorden
  for (const w of orderedWords) {
    if (cards.length >= size) break;
    const unseen = dirs.filter(d => !item(w.id, d));
    if (unseen.length) add(w.id, unseen[Math.random() * unseen.length | 0], "nieuw");
  }
  // 3. foute woorden die pas later gepland stonden
  for (const [k, v] of pending) { if (cards.length >= size) break; if (v.due > S) add(...k.split("|"), "terug"); }
  // 4. herhaling van gekende woorden (na de eerste ronde): moeilijke en lang niet geziene eerst
  if (cards.length < size) {
    const rest = Object.entries(state.items)
      .filter(([k, v]) => v.due == null && dirs.includes(k.split("|")[1]))
      .sort((a, b) => (difficulty(a[1]) === "moeilijk" ? 0 : 1) - (difficulty(b[1]) === "moeilijk" ? 0 : 1) || a[1].last - b[1].last);
    for (const [k] of rest) { if (cards.length >= size) break; add(...k.split("|"), "herhaling"); }
  }
  return shuffle(cards);
}

function buildThemeSession(themeIds) {
  const dirs = dirList(state.settings.dir);
  const words = DATA.words.filter(w => w.themes.some(t => themeIds.includes(t)));
  return shuffle(words.map(w => ({ wid: w.id, dir: dirs[Math.random() * dirs.length | 0], why: "thema" })));
}

/* ───────────── Spel: XP, levels, badges, reeks ───────────── */
const LEVELS = ["Débutant", "Apprenti", "Élève", "Bon élève", "Explorateur", "Champion", "As du français", "Expert", "Maître", "Légende"];
function levelInfo(xp = state.xp) {
  let lvl = 1, need = 150, base = 0;
  while (xp >= base + need) { base += need; lvl++; need = 150 + (lvl - 1) * 100; }
  return { lvl, title: LEVELS[Math.min(lvl - 1, LEVELS.length - 1)], into: xp - base, need };
}
function dayStreak() {
  let n = 0; const d = new Date();
  if (!state.days[today(d)]?.sessions) d.setDate(d.getDate() - 1); // vandaag nog niet geoefend: reeks loopt nog
  while (state.days[today(d)]?.sessions) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function wordsSeen() { const s = new Set(); for (const k in state.items) if (byId[k.split("|")[0]]) s.add(k.split("|")[0]); return s.size; }
function wordsKnown() { const s = new Set(); for (const [k, v] of Object.entries(state.items)) if (v.c > 0 && v.due == null && byId[k.split("|")[0]]) s.add(k.split("|")[0]); return s.size; }
function themeDone(t) { const ws = DATA.words.filter(w => w.themes.includes(t.id)); return ws.filter(w => ["nf", "fn"].some(d => { const it = item(w.id, d); return it && it.c > 0 && it.due == null; })).length; }

const BADGES = [
  { id: "first", e: "🎉", n: "Eerste sessie", d: "Je eerste dagsessie afgewerkt", ok: () => state.sessionCount >= 1 },
  { id: "streak3", e: "🔥", n: "3 dagen op rij", ok: () => state.bestStreak >= 3 },
  { id: "streak7", e: "🔥", n: "Een week op rij", ok: () => state.bestStreak >= 7 },
  { id: "streak14", e: "🌟", n: "2 weken op rij", ok: () => state.bestStreak >= 14 },
  { id: "streak30", e: "🏆", n: "30 dagen op rij", ok: () => state.bestStreak >= 30 },
  { id: "w50", e: "📗", n: "50 woorden gekend", ok: () => wordsKnown() >= 50 },
  { id: "w100", e: "📘", n: "100 woorden gekend", ok: () => wordsKnown() >= 100 },
  { id: "w250", e: "📙", n: "250 woorden gekend", ok: () => wordsKnown() >= 250 },
  { id: "w500", e: "📚", n: "500 woorden gekend", ok: () => wordsKnown() >= 500 },
  { id: "wall", e: "🗼", n: "Alle woorden gekend", ok: () => DATA && wordsKnown() >= DATA.words.length },
  { id: "run10", e: "⚡", n: "10 juist op rij", ok: () => state.bestRun >= 10 },
  { id: "run25", e: "⚡", n: "25 juist op rij", ok: () => state.bestRun >= 25 },
  { id: "run50", e: "💎", n: "50 juist op rij", ok: () => state.bestRun >= 50 },
  { id: "perfect", e: "💯", n: "Perfecte sessie", d: "Dagsessie zonder één fout", ok: ctx => ctx?.perfect },
  { id: "writer", e: "✍️", n: "100 keer juist geschreven", ok: () => state.writtenCorrect >= 100 },
  { id: "fighter", e: "💪", n: "Doorzetter", d: "25 foute woorden alsnog juist", ok: () => state.recovered >= 25 },
  { id: "lvl5", e: "🚀", n: "Level 5", ok: () => levelInfo().lvl >= 5 },
  { id: "lvl10", e: "👑", n: "Level 10", ok: () => levelInfo().lvl >= 10 },
];
function checkBadges(ctx) {
  const fresh = [];
  for (const b of BADGES) if (!state.badges[b.id] && b.ok(ctx)) { state.badges[b.id] = today(); fresh.push(b); }
  for (const t of DATA.themes) {
    const id = "theme:" + t.id;
    if (!state.badges[id] && t.count && themeDone(t) >= t.count) { state.badges[id] = today(); fresh.push({ id, e: "🎖️", n: "Thema-meester: " + t.title }); }
  }
  return fresh;
}

/* ───────────── Schermen ───────────── */
let view = { name: "home" };
function go(v) { view = v; render(); window.scrollTo(0, 0); }

function render() {
  if (!DATA) return;
  const fn = { home: viewHome, session: viewSession, summary: viewSummary, themes: viewThemes, badges: viewBadges, parents: viewParents }[view.name] || viewHome;
  $app.innerHTML = fn();
  afterRender();
}

function seg(name, value, options) {
  return `<div class="seg" role="group">${options.map(([v, label]) => `<button data-act="set" data-k="${name}" data-v="${v}" class="${value === v ? "on" : ""}">${label}</button>`).join("")}</div>`;
}

function viewHome() {
  const s = state.settings, L = levelInfo(), streak = dayStreak();
  const doneToday = state.days[today()]?.sessions || 0;
  const total = DATA.words.length, seen = wordsSeen(), known = wordsKnown();
  const dirs = dirList(s.dir);
  const pendingNow = Object.entries(state.items).filter(([k, v]) => v.due != null && dirs.includes(k.split("|")[1])).length;
  return `
  <header class="hero">
    <div><h1>Salut ${esc(s.name)} !</h1><div class="flag"><i></i><i></i><i></i></div></div>
    <button class="icon-btn" data-act="go" data-v="parents" aria-label="Ouders en instellingen">⚙️</button>
  </header>
  <div class="stats">
    <div class="stat"><b>🔥 ${streak}</b><span>${streak === 1 ? "dag" : "dagen"} op rij</span></div>
    <div class="stat"><b>${known}</b><span>woorden gekend</span></div>
    <div class="stat"><b>${state.bestRun}</b><span>record reeks</span></div>
  </div>
  <div class="card level">
    <div class="badge-lvl">${L.lvl}</div>
    <div style="flex:1" class="stack">
      <div class="row spread"><b>${L.title}</b><span class="muted small">${state.xp} XP</span></div>
      <div class="bar"><i style="width:${Math.round(L.into / L.need * 100)}%"></i></div>
    </div>
  </div>
  <section class="card stack">
    <h3>Hoe oefen je vandaag?</h3>
    ${seg("mode", s.mode, [["oral", "🗣️ Mondeling"], ["written", "✍️ Schriftelijk"]])}
    ${seg("dir", s.dir, [["nf", "NL → FR"], ["fn", "FR → NL"], ["mix", "Gemengd"]])}
    <button class="btn-primary btn-block" data-act="start-daily">${doneToday ? "Nog een sessie" : "Start dagsessie"}</button>
    <p class="muted small" style="text-align:center">${doneToday ? `✅ Vandaag al ${doneToday}× geoefend. Knap!` : `±${s.sessionSize} kaartjes · 5 à 10 minuten`}${pendingNow ? ` · ${pendingNow} woorden komen terug` : ""}</p>
  </section>
  <section class="card stack">
    <div class="row spread"><b>Ronde door alle woorden</b><span class="muted small">${seen} / ${total}</span></div>
    <div class="bar green"><i style="width:${(seen / total * 100).toFixed(1)}%"></i></div>
  </section>
  <nav class="nav">
    <button data-act="go" data-v="themes"><span>📚</span>Oefen thema</button>
    <button data-act="go" data-v="badges"><span>🏅</span>Badges</button>
    <button data-act="go" data-v="parents"><span>👪</span>Ouders</button>
  </nav>`;
}

/* --- Oefensessie --- */
function startSession(kind, cards, themeIds) {
  if (!cards.length) { toast("Geen woorden gevonden om te oefenen."); return; }
  if (kind === "daily") { state.sessionCount++; save(); }
  go({ name: "session", kind, themeIds, cards, i: 0, phase: "ask", results: [], run: 0, xp: 0, retries: 0 });
}

function cardInfo(card) {
  const w = byId[card.wid];
  const nf = card.dir === "nf";
  return { w, nf, prompt: nf ? w.nl : w.fr, answer: nf ? w.fr : w.nl };
}

function viewSession() {
  const v = view, card = v.cards[v.i], { w, nf, prompt, answer } = cardInfo(card);
  const oral = state.settings.mode === "oral";
  const progress = Math.round(v.i / v.cards.length * 100);
  const theme = themeById[w.themes[0]];
  const why = card.retry ? "🔁 nog eens" : card.why === "terug" ? "🔁 komt terug" : card.why === "nieuw" ? "✨ nieuw" : "";
  let body = "";
  if (v.phase === "ask") {
    body = oral
      ? `<button class="btn-primary btn-block" data-act="reveal">Toon antwoord</button>
         <p class="muted small" style="text-align:center">Zeg het antwoord eerst luidop.</p>`
      : `<input id="answer" class="answer-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${nf ? "In het Frans…" : "In het Nederlands…"}" aria-label="Jouw antwoord">
         ${nf ? `<div class="accents">${["é", "è", "ê", "à", "ç", "ô", "œ", "â", "î", "ï", "û", "ù", "ë", "'"].map(c => `<button data-act="ins" data-v="${c}" tabindex="-1">${c}</button>`).join("")}</div>` : ""}
         <div class="grid2"><button data-act="dontknow">Weet ik niet</button><button class="btn-primary" data-act="check">Controleer</button></div>`;
  } else {
    const r = v.last;
    const label = { juist: "✓ Juist!", bijna: "≈ Bijna!", fout: "✗ Fout" }[r?.verdict] || "";
    const alts = (nf ? siblingsNl(w) : siblingsFr(w)).filter(x => x.id !== w.id);
    const ex = w.ex ? `<div class="example"><button class="speak" data-act="speak" data-v="${esc(w.ex)}" aria-label="Zin beluisteren">🔊</button><span>${esc(w.ex)}</span></div>` : "";
    body = `
      <div class="feedback ${oral && !r ? "" : r.verdict} pop" ${oral && !r ? 'style="background:var(--card);box-shadow:var(--shadow)"' : ""}>
        ${r ? `<div class="verdict">${label}${r.note ? ` <span class="small" style="font-weight:600">— ${esc(r.note)}</span>` : ""}</div>` : ""}
        ${r && !oral && r.verdict !== "juist" && v.typed ? `<div class="small">Jij schreef: <s>${esc(v.typed)}</s></div>` : ""}
        <div class="row" style="gap:8px"><div class="solution" style="flex:1">${esc(answer)}</div>
          <button class="speak" data-act="speak" data-v="${esc(w.fr)}" aria-label="Uitspraak">🔊</button></div>
        ${alts.length ? `<div class="small muted">Ook juist: ${alts.map(a => esc(nf ? a.fr : a.nl)).join(" · ")}</div>` : ""}
        ${ex}
      </div>
      ${oral && !r
        ? `<p class="muted small" style="text-align:center">Wist je het?</p>
           <div class="judge"><button class="btn-bad" data-act="judge" data-v="fout">✗ Fout</button><button class="btn-mid" data-act="judge" data-v="bijna">≈ Bijna</button><button class="btn-good" data-act="judge" data-v="juist">✓ Juist</button></div>`
        : `<button class="btn-primary btn-block" data-act="next" id="nextBtn">Volgende →</button>`}
      <button class="btn-ghost report-link" data-act="report" data-v="${esc(w.id)}">⚑ Klopt dit woord niet?</button>`;
  }
  return `
  <div class="topbar">
    <button class="icon-btn" data-act="quit" aria-label="Stoppen">✕</button>
    <div class="bar"><i style="width:${progress}%"></i></div>
    <span class="muted small">${v.i + 1}/${v.cards.length}</span>
  </div>
  <div class="combo">${v.run >= 3 ? `🔥 ${v.run} juist op rij` : ""}</div>
  <section class="card prompt-card">
    <span class="dir-label">${nf ? "🇳🇱 → 🇫🇷" : "🇫🇷 → 🇳🇱"} ${why ? "· " + why : ""}</span>
    <div class="prompt">${esc(prompt)}</div>
    ${!nf ? `<button class="speak" data-act="speak" data-v="${esc(w.fr)}" aria-label="Beluister">🔊</button>` : ""}
    <span class="theme-chip">${esc(theme?.title || "")}</span>
  </section>
  ${body}`;
}

function answerCard(verdict, extra = {}) {
  const v = view, card = v.cards[v.i];
  const isRetry = !!card.retry;
  if (!isRetry) record(card, verdict);
  v.results.push({ ...card, verdict, retry: isRetry });
  let gained = 0;
  if (verdict === "juist") {
    v.run++; state.bestRun = Math.max(state.bestRun, v.run);
    gained = isRetry ? 2 : state.settings.mode === "written" ? 15 : 10;
    if (state.settings.mode === "written" && !isRetry) state.writtenCorrect++;
    if (v.run > 0 && v.run % 5 === 0) gained += 10;
  } else {
    v.run = 0; gained = verdict === "bijna" && !isRetry ? 3 : 0;
    // in themamodus komen foute woorden achteraan opnieuw, tot ze juist zijn
    if (v.kind === "theme") v.cards.push({ ...card, retry: true });
  }
  v.xp += gained; state.xp += gained;
  const d = state.days[today()] ||= { sessions: 0, cards: 0, correct: 0 };
  d.cards++; if (verdict === "juist") d.correct++;
  v.last = { verdict, ...extra };
  v.phase = "feedback";
  save(); render();
  if (state.settings.mode === "written") speak(byId[card.wid].fr); // mondeling: al uitgesproken bij "Toon antwoord"
}

function nextCard() {
  const v = view;
  v.i++; v.last = null; v.typed = "";
  if (v.i >= v.cards.length) return finishSession();
  v.phase = "ask"; render();
  const c = cardInfo(v.cards[v.i]);
  if (!c.nf) speak(c.w.fr);
}

function finishSession() {
  const v = view;
  const firsts = v.results.filter(r => !r.retry);
  const count = k => firsts.filter(r => r.verdict === k).length;
  const perfect = v.kind === "daily" && firsts.length >= 10 && count("juist") === firsts.length;
  const d = state.days[today()] ||= { sessions: 0, cards: 0, correct: 0 };
  d.sessions++;
  const bonus = 20 + Math.min(dayStreak(), 10) * 5;
  state.xp += bonus; v.xp += bonus;
  state.bestStreak = Math.max(state.bestStreak, dayStreak());
  const before = levelInfo(state.xp - v.xp).lvl;
  const fresh = checkBadges({ perfect });
  save();
  go({ name: "summary", kind: v.kind, juist: count("juist"), bijna: count("bijna"), fout: count("fout"), xp: v.xp, bonus, fresh, levelUp: levelInfo().lvl > before,
    back: firsts.filter(r => r.verdict !== "juist").map(r => r.wid), themeIds: v.themeIds });
  if (fresh.length || perfect || view.levelUp) confetti();
}

function viewSummary() {
  const v = view, total = v.juist + v.bijna + v.fout;
  const pct = total ? Math.round(v.juist / total * 100) : 0;
  const msg = pct === 100 ? "Parfait ! 🤩" : pct >= 80 ? "Très bien ! 👏" : pct >= 50 ? "Bien joué ! 👍" : "Courage ! 💪";
  const L = levelInfo();
  return `
  <h1 style="text-align:center;margin-top:8px">${msg}</h1>
  <div class="card stack" style="text-align:center">
    <div class="big-score">${v.juist}<span class="muted" style="font-size:24px"> / ${total}</span></div>
    <div class="row" style="justify-content:center;gap:18px"><span style="color:var(--green)">✓ ${v.juist}</span><span style="color:var(--amber)">≈ ${v.bijna}</span><span style="color:var(--red)">✗ ${v.fout}</span></div>
    <div><b>+${v.xp} XP</b> <span class="muted small">(waarvan ${v.bonus} sessiebonus)</span></div>
    ${v.levelUp ? `<div class="pop"><b>⬆️ Level ${L.lvl}: ${L.title}!</b></div>` : ""}
    <div class="muted small">🔥 ${dayStreak()} ${dayStreak() === 1 ? "dag" : "dagen"} op rij</div>
  </div>
  ${v.fresh.length ? `<section class="card stack"><h3>Nieuwe badges</h3><div class="badges">${v.fresh.map(b => `<div class="bdg pop"><span class="e">${b.e}</span><span class="n">${esc(b.n)}</span></div>`).join("")}</div></section>` : ""}
  ${v.back.length ? `<section class="card stack"><h3>${v.kind === "daily" ? "Deze woorden komen de volgende sessies terug" : "Nog eens bekijken"}</h3>
    <div class="chips">${[...new Set(v.back)].map(id => `<span class="chip">${esc(byId[id].fr)} = ${esc(byId[id].nl)}</span>`).join("")}</div></section>` : ""}
  <button class="btn-primary btn-block" data-act="go" data-v="home">Klaar</button>
  ${v.kind === "theme" ? `<button class="btn-block" data-act="start-theme-again">Thema nog eens</button>` : ""}`;
}

/* --- Thema's --- */
function viewThemes() {
  const sel = view.sel || [];
  const groups = {};
  for (const t of DATA.themes) (groups[t.source] ||= []).push(t);
  return `
  <div class="topbar"><button class="icon-btn" data-act="go" data-v="home" aria-label="Terug">←</button><h2>Oefen een thema</h2></div>
  <p class="muted small">Kies één of meer thema's, bv. voor een toets. Foute woorden komen achteraan terug tot alles juist is.</p>
  <div class="card stack">
    ${seg("mode", state.settings.mode, [["oral", "🗣️ Mondeling"], ["written", "✍️ Schriftelijk"]])}
    ${seg("dir", state.settings.dir, [["nf", "NL → FR"], ["fn", "FR → NL"], ["mix", "Gemengd"]])}
  </div>
  ${Object.entries(groups).map(([src, ts]) => `
    <h3>${esc(src)}</h3>
    <div class="list">${ts.map(t => {
      const done = themeDone(t);
      return `<button class="list-item ${sel.includes(t.id) ? "sel" : ""}" data-act="toggle-theme" data-v="${t.id}">
        <div class="grow"><div class="t">${esc(t.title)}</div><div class="bar green" style="margin-top:6px"><i style="width:${t.count ? done / t.count * 100 : 0}%"></i></div></div>
        <span class="pill">${done}/${t.count}</span>${state.badges["theme:" + t.id] ? "🎖️" : ""}</button>`;
    }).join("")}</div>`).join("")}
  <div style="position:sticky;bottom:12px"><button class="btn-primary btn-block" data-act="start-theme" ${sel.length ? "" : "disabled"}>${sel.length ? `Start (${DATA.words.filter(w => w.themes.some(t => sel.includes(t))).length} woorden)` : "Kies een thema"}</button></div>`;
}

/* --- Badges --- */
function viewBadges() {
  const themeBadges = DATA.themes.filter(t => state.badges["theme:" + t.id]);
  return `
  <div class="topbar"><button class="icon-btn" data-act="go" data-v="home" aria-label="Terug">←</button><h2>Badges & records</h2></div>
  <div class="stats">
    <div class="stat"><b>${state.bestRun}</b><span>langste reeks juist</span></div>
    <div class="stat"><b>${state.bestStreak}</b><span>langste dagenreeks</span></div>
    <div class="stat"><b>${state.xp}</b><span>XP totaal</span></div>
  </div>
  <div class="badges">${BADGES.map(b => `<div class="bdg ${state.badges[b.id] ? "" : "locked"}" title="${esc(b.d || b.n)}"><span class="e">${b.e}</span><span class="n">${esc(b.n)}</span></div>`).join("")}</div>
  <h3>Thema-meester (${themeBadges.length}/${DATA.themes.length})</h3>
  <p class="muted small">Elk woord van een thema minstens één keer juist = 🎖️</p>
  <div class="badges">${DATA.themes.map(t => `<div class="bdg ${state.badges["theme:" + t.id] ? "" : "locked"}"><span class="e">🎖️</span><span class="n">${esc(t.title)}</span></div>`).join("")}</div>`;
}

/* --- Ouders --- */
function viewParents() {
  const tab = view.tab || "overzicht";
  const tabs = [["overzicht", "Overzicht"], ["woorden", "Woorden"], ["meldingen", `Meldingen${state.reports.length ? ` (${state.reports.length})` : ""}`], ["instellingen", "Instellingen"]];
  return `
  <div class="topbar"><button class="icon-btn" data-act="go" data-v="home" aria-label="Terug">←</button><h2>Ouders</h2></div>
  <div class="seg tabs">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
  ${{ overzicht: parentsOverview, woorden: parentsWords, meldingen: parentsReports, instellingen: parentsSettings }[tab]()}`;
}

function allStats() {
  const per = { makkelijk: 0, moeilijk: 0 };
  let s = 0, c = 0;
  for (const [k, it] of Object.entries(state.items)) { if (!byId[k.split("|")[0]]) continue; s += it.s; c += it.c; const d = difficulty(it); if (d) per[d]++; }
  return { s, c, ...per };
}

function parentsOverview() {
  const st = allStats(), total = DATA.words.length;
  const days = []; const d = new Date(); d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) { days.push({ key: today(d), wd: "zmdwdvz"[d.getDay()], v: state.days[today(d)]?.cards || 0 }); d.setDate(d.getDate() + 1); }
  const max = Math.max(10, ...days.map(x => x.v));
  const daysPracticed = Object.values(state.days).filter(x => x.sessions).length;
  const roundDone = ["nf", "fn"].map(dir => DATA.words.filter(w => item(w.id, dir)).length);
  return `
  <div class="stats">
    <div class="stat"><b>${daysPracticed}</b><span>dagen geoefend</span></div>
    <div class="stat"><b>${st.s}</b><span>kaartjes</span></div>
    <div class="stat"><b>${st.s ? Math.round(st.c / st.s * 100) : 0}%</b><span>juist</span></div>
  </div>
  <section class="card stack">
    <h3>Laatste 14 dagen</h3>
    <div class="days">${days.map(x => `<i class="${x.v ? "" : "zero"}" style="height:${Math.max(4, x.v / max * 100)}%" title="${x.key}: ${x.v}"></i>`).join("")}</div>
    <div class="days" style="height:auto">${days.map(x => `<span class="muted" style="font-size:11px;text-align:center">${x.wd}</span>`).join("")}</div>
  </section>
  <section class="card stack">
    <h3>Eerste ronde</h3>
    <div class="row spread small"><span>NL → FR gezien</span><b>${roundDone[0]} / ${total}</b></div>
    <div class="bar"><i style="width:${roundDone[0] / total * 100}%"></i></div>
    <div class="row spread small"><span>FR → NL gezien</span><b>${roundDone[1]} / ${total}</b></div>
    <div class="bar"><i style="width:${roundDone[1] / total * 100}%"></i></div>
    <div class="row spread small"><span>Makkelijk voor ${esc(state.settings.name)}</span><span class="pill easy">${st.makkelijk}</span></div>
    <div class="row spread small"><span>Moeilijk voor ${esc(state.settings.name)}</span><span class="pill hard">${st.moeilijk}</span></div>
    <p class="muted small">Makkelijk = meteen juist en zelden fout. Moeilijk = minstens één keer fout of bijna voor het juist was, of vaak fout.</p>
  </section>
  <section class="card stack">
    <h3>Per thema</h3>
    <table><tr><th>Thema</th><th class="num">Gekend</th><th class="num">Moeilijk</th></tr>
    ${DATA.themes.map(t => {
      const ws = DATA.words.filter(w => w.themes.includes(t.id));
      const hard = ws.filter(w => ["nf", "fn"].some(dd => difficulty(item(w.id, dd)) === "moeilijk")).length;
      return `<tr><td>${esc(t.title)}</td><td class="num">${themeDone(t)}/${t.count}</td><td class="num">${hard || ""}</td></tr>`;
    }).join("")}</table>
  </section>`;
}

function parentsWords() {
  const q = (view.q || "").toLowerCase();
  const filter = view.filter || "moeilijk";
  let rows = DATA.words.map(w => {
    const its = ["nf", "fn"].map(d => item(w.id, d)).filter(Boolean);
    const s = its.reduce((a, b) => a + b.s, 0), wrong = its.reduce((a, b) => a + b.w + b.a, 0);
    const diff = its.some(i => difficulty(i) === "moeilijk") ? "moeilijk" : its.length ? "makkelijk" : null;
    return { w, s, wrong, diff, pending: its.some(i => i.due != null) };
  });
  if (q) rows = rows.filter(r => stripAccents((r.w.fr + " " + r.w.nl).toLowerCase()).includes(stripAccents(q)));
  else if (filter === "moeilijk") rows = rows.filter(r => r.diff === "moeilijk").sort((a, b) => b.wrong - a.wrong);
  else if (filter === "makkelijk") rows = rows.filter(r => r.diff === "makkelijk");
  else if (filter === "open") rows = rows.filter(r => r.pending);
  return `
  <input type="search" id="wordSearch" placeholder="Zoek een woord…" value="${esc(view.q || "")}">
  ${q ? "" : seg("filter", filter, [["moeilijk", "Moeilijk"], ["open", "Komt terug"], ["makkelijk", "Makkelijk"]])}
  <p class="muted small">${rows.length} woorden · tik op een woord om een fout te melden</p>
  <div class="list">${rows.slice(0, 200).map(r => `
    <button class="list-item" data-act="report" data-v="${esc(r.w.id)}">
      <div class="grow"><div class="t">${esc(r.w.fr)}</div><div class="small muted">${esc(r.w.nl)}</div></div>
      ${r.s ? `<span class="pill">${r.s}× · ${r.wrong} fout</span>` : `<span class="pill">nog niet gezien</span>`}
      ${r.diff ? `<span class="pill ${r.diff === "moeilijk" ? "hard" : "easy"}">${r.diff}</span>` : ""}
    </button>`).join("")}</div>`;
}

function parentsReports() {
  return `
  <section class="card stack">
    <p class="small">Klopt een woord, vertaling of zin niet? Meld het via ⚑ tijdens het oefenen of in de lijst <b>Woorden</b>. Kopieer daarna de lijst en geef ze aan Claude, die past de woordenlijst aan.</p>
    ${state.reports.length ? `<div class="list">${state.reports.map((r, i) => `
      <div class="list-item"><div class="grow"><div class="t">${esc(r.fr)} = ${esc(r.nl)}</div><div class="small muted">${esc(r.note || "(geen uitleg)")} · ${esc(r.date)}</div></div>
      <button class="icon-btn" data-act="del-report" data-v="${i}" aria-label="Verwijder">🗑️</button></div>`).join("")}</div>
      <div class="grid2"><button data-act="copy-reports">📋 Kopieer lijst</button><button data-act="clear-reports">Wis alles</button></div>`
      : `<p class="muted">Nog geen meldingen.</p>`}
  </section>`;
}

function parentsSettings() {
  const s = state.settings;
  return `
  <section class="card stack">
    <h3>Oefenen</h3>
    <label class="stack small">Naam<input type="search" id="nameInput" value="${esc(s.name)}" autocomplete="off"></label>
    <div class="small">Kaartjes per dagsessie</div>
    ${seg("sessionSize", String(s.sessionSize), [["10", "10"], ["15", "15"], ["20", "20"], ["25", "25"], ["30", "30"]])}
    <div class="small">Franse uitspraak</div>
    ${seg("tts", String(s.tts), [["true", "🔊 Aan"], ["false", "🔇 Uit"]])}
    <div class="small">Spreektempo</div>
    ${seg("rate", String(s.rate), [["0.7", "Traag"], ["0.9", "Normaal"], ["1.05", "Snel"]])}
    <button data-act="speak" data-v="Bonjour ! Je m'appelle ${esc(s.name)}. J'apprends le français.">🔊 Test de stem</button>
    <p class="muted small">${voice ? `Stem: ${esc(voice.name)} (${esc(voice.lang)})` : "Geen Franse stem gevonden. Op Android: Instellingen › Systeem › Talen › Tekst-naar-spraak › installeer Frans."}</p>
  </section>
  <section class="card stack">
    <h3>Voortgang overzetten</h3>
    <p class="small">De voortgang staat enkel op dit toestel. Wissel je tussen gsm en iPad? Bewaar de voortgang hier en open het bestand op het andere toestel met <b>Voortgang laden</b>. Doe dit ook af en toe als back-up.</p>
    <div class="grid2"><button data-act="export">💾 Voortgang bewaren</button><button data-act="import">📂 Voortgang laden</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </section>
  <section class="card stack">
    <h3>Woordenlijst</h3>
    <p class="small muted">${DATA.words.length} woorden in ${DATA.themes.length} thema's · versie ${esc(DATA.version.slice(0, 10))}</p>
    <button class="btn-bad" data-act="reset">Alle voortgang wissen</button>
  </section>`;
}

/* ───────────── Acties ───────────── */
function exportProgress() {
  const blob = new Blob([JSON.stringify({ app: "frans-oefenen", exported: new Date().toISOString(), state })], { type: "application/json" });
  const name = `frans-voortgang-${today()}.json`;
  const file = new File([blob], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: "Frans voortgang" }).catch(() => {});
  } else {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
async function importProgress(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "frans-oefenen" || !data.state?.items) throw new Error("onbekend bestand");
    const when = new Date(data.exported).toLocaleString("nl-BE");
    if (!confirm(`Voortgang van ${when} laden? De huidige voortgang op dit toestel wordt vervangen.`)) return;
    state = { ...DEFAULT_STATE(), ...data.state, settings: { ...DEFAULT_STATE().settings, ...data.state.settings } };
    save(); toast("Voortgang geladen ✓"); go({ name: "home" });
  } catch (e) { alert("Dit bestand kan niet geladen worden: " + e.message); }
}
function reportWord(id) {
  const w = byId[id]; if (!w) return;
  const note = prompt(`Wat klopt er niet aan:\n${w.fr} = ${w.nl}${w.ex ? `\n„${w.ex}"` : ""}\n\nKorte uitleg (mag leeg):`, "");
  if (note === null) return;
  state.reports.push({ id, fr: w.fr, nl: w.nl, note: note.trim(), date: today() });
  save(); toast("Gemeld, bedankt! Zie Ouders › Meldingen."); if (view.name === "parents") render();
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
  const act = el.dataset.act, v = el.dataset.v;
  switch (act) {
    case "go": go({ name: v }); break;
    case "set": {
      const k = el.dataset.k;
      if (k === "filter") { view.filter = v; render(); break; }
      state.settings[k] = k === "sessionSize" ? +v : k === "tts" ? v === "true" : k === "rate" ? +v : v;
      save(); render(); break;
    }
    case "start-daily": startSession("daily", buildDailySession()); break;
    case "toggle-theme": { const s = new Set(view.sel || []); s.has(v) ? s.delete(v) : s.add(v); view.sel = [...s]; const y = scrollY; render(); scrollTo(0, y); break; }
    case "start-theme": startSession("theme", buildThemeSession(view.sel), view.sel); break;
    case "start-theme-again": startSession("theme", buildThemeSession(view.themeIds), view.themeIds); break;
    case "reveal": view.phase = "feedback"; view.last = null; render(); speak(byId[view.cards[view.i].wid].fr); break;
    case "judge": answerCard(v); break;
    case "check": checkWritten(); break;
    case "dontknow": view.typed = ""; answerCard("fout"); break;
    case "next": nextCard(); break;
    case "ins": { const inp = document.getElementById("answer"); if (!inp) break; const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s; inp.value = inp.value.slice(0, s) + v + inp.value.slice(en); inp.focus(); inp.setSelectionRange(s + v.length, s + v.length); break; }
    case "speak": speak(v); break;
    case "quit": if (confirm("Stoppen met deze sessie? Je antwoorden tot nu toe blijven bewaard.")) go({ name: "home" }); break;
    case "report": reportWord(v); break;
    case "tab": view.tab = v; render(); break;
    case "del-report": state.reports.splice(+v, 1); save(); render(); break;
    case "clear-reports": if (confirm("Alle meldingen wissen?")) { state.reports = []; save(); render(); } break;
    case "copy-reports": {
      const txt = "Fouten in de woordenlijst Frans:\n" + state.reports.map(r => `- ${r.fr} = ${r.nl}${r.note ? ` → ${r.note}` : ""}`).join("\n");
      navigator.clipboard?.writeText(txt).then(() => toast("Gekopieerd ✓"), () => prompt("Kopieer deze tekst:", txt));
      break;
    }
    case "export": exportProgress(); break;
    case "import": document.getElementById("importFile").click(); break;
    case "reset":
      if (confirm("Echt ALLE voortgang, badges en XP wissen?") && confirm("Zeker? Dit kan niet ongedaan gemaakt worden.")) { state = DEFAULT_STATE(); save(); go({ name: "home" }); }
      break;
  }
});

function checkWritten() {
  const inp = document.getElementById("answer"); if (!inp) return;
  const typed = inp.value.trim();
  if (!typed) { inp.focus(); toast("Typ eerst je antwoord (of tik Weet ik niet)."); return; }
  const { w, nf } = cardInfo(view.cards[view.i]);
  const r = nf ? gradeFr(typed, siblingsNl(w).map(x => x.fr)) : gradeNl(typed, siblingsFr(w).map(x => x.nl));
  view.typed = typed;
  answerCard(r.verdict, { note: r.note });
}

document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || view.name !== "session") return;
  if (view.phase === "ask" && e.target.id === "answer") { e.preventDefault(); checkWritten(); }
  else if (view.phase === "feedback" && document.getElementById("nextBtn") && !e.repeat && Date.now() - (view.feedbackAt || 0) > 400) { e.preventDefault(); nextCard(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "wordSearch") { view.q = e.target.value; const pos = e.target.selectionStart; render(); const s = document.getElementById("wordSearch"); s.focus(); s.setSelectionRange(pos, pos); }
  if (e.target.id === "nameInput") { state.settings.name = e.target.value.trim() || "Warre"; save(); }
});
document.addEventListener("change", e => { if (e.target.id === "importFile" && e.target.files[0]) importProgress(e.target.files[0]); });

function afterRender() {
  if (view.name === "session" && view.phase === "ask") document.getElementById("answer")?.focus();
  if (view.name === "session" && view.phase === "feedback") { document.activeElement?.blur?.(); view.feedbackAt = Date.now(); }
}

/* ───────────── Start ───────────── */
(async () => {
  try { await loadWords(); } catch (e) { $app.innerHTML = `<p class="loading">De woordenlijst kon niet geladen worden. Controleer de internetverbinding en probeer opnieuw.</p>`; return; }
  navigator.storage?.persist?.().catch(() => {});
  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
