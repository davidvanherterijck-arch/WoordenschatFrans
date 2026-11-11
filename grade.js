// Verbetering van antwoorden. Resultaat: { verdict: "juist" | "bijna" | "fout", note }

const ANNOT = /\(\s*(m|f|v)\.?\s*(?:\/\s*(f|v)\.?)?\s*(pl\.?)?\s*\)|\(aanspr\.?\)|\(aanspreking\)/gi;

export const stripAccents = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function baseNorm(s) {
  return s.toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/…/g, "...")
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, "$1")
    .replace(/\.\.\./g, " ")
    .replace(/\s*'\s*/g, "'")
    .replace(/[()]/g, "")
    .replace(/[?!.;:"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Optionele stukken tussen haakjes: versie mét inhoud en versie zonder.
function expandParens(s) {
  if (!s.includes("(")) return [s];
  const withC = s.replace(/[()]/g, "");
  const without = s.replace(/\([^)]*\)/g, "");
  return [...new Set([withC, without].map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function genderOf(fr) {
  const m = [...fr.matchAll(new RegExp(ANNOT.source, "gi"))][0];
  if (!m) return { g: null, pl: false };
  const a = m[1].toLowerCase(), b = (m[2] || "").toLowerCase();
  const g = b ? "mf" : (a === "m" ? "m" : "f");
  return { g, pl: !!m[3] };
}

const ART = /^(un|une|le|la|les|des)\s+|^l'/;
function splitArticle(s) {
  const m = s.match(ART);
  if (!m) return { art: null, core: s };
  return { art: m[1] || "l'", core: s.slice(m[0].length).trim() };
}
function artInfo(art, annot) {
  if (!art) return null;
  if (art === "un" || art === "le") return { g: "m", pl: false };
  if (art === "une" || art === "la") return { g: "f", pl: false };
  if (art === "les" || art === "des") return { g: annot.g || "mf", pl: true };
  return { g: annot.g || "mf", pl: false }; // l'
}

/** Alle aanvaardbare Franse vormen van een kaart. */
export function frForms(fr) {
  const annot = genderOf(fr);
  const clean = fr.replace(ANNOT, "").trim();
  const alts = clean.split(/\s*,\s*/).filter(Boolean);
  const forms = [];
  for (const alt of [clean, ...alts]) {
    for (const v of expandParens(alt)) {
      const n = baseNorm(v);
      const { art, core } = splitArticle(n);
      forms.push({ text: n, art, core, info: artInfo(art, annot) });
    }
  }
  return forms;
}

export function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : 99);
  return d[a.length][b.length];
}

const RANK = { juist: 3, bijna: 2, fout: 1 };

function gradeOneFr(answer, form) {
  const ans = baseNorm(answer.replace(ANNOT, ""));
  const { art: uArt, core: uCore } = splitArticle(ans);
  const notes = [];
  // kern vergelijken
  let coreV;
  if (uCore === form.core) coreV = "juist";
  else if (uCore.replace(/-/g, " ") === form.core.replace(/-/g, " ")) { coreV = "bijna"; notes.push("let op het koppelteken"); }
  else if (stripAccents(uCore) === stripAccents(form.core)) { coreV = "bijna"; notes.push("let op de accenten"); }
  else if (form.core.length >= 4 && lev(stripAccents(uCore), stripAccents(form.core)) <= 1) { coreV = "bijna"; notes.push("kleine schrijffout"); }
  else return { verdict: "fout" };
  // lidwoord vergelijken
  if (form.art) {
    const fi = form.info, ui = artInfo(uArt, { g: fi.g });
    if (!uArt) { notes.push("lidwoord vergeten"); coreV = "bijna"; }
    else if (form.art === "l'" && (uArt === "le" || uArt === "la")) { notes.push("gebruik l' (klinker of stomme h)"); coreV = "bijna"; }
    else if (form.art === "l'" && fi.g !== "mf" && (uArt === "un" || uArt === "une") && ui.g !== fi.g) { notes.push(fi.g === "m" ? "het is mannelijk (un / l')" : "het is vrouwelijk (une / l')"); coreV = "bijna"; }
    else if (form.art !== "l'" && uArt === "l'") { notes.push("verkeerd lidwoord"); coreV = "bijna"; }
    else if (ui.pl !== fi.pl) { notes.push(fi.pl ? "het is meervoud" : "het is enkelvoud"); coreV = "bijna"; }
    else if (fi.g !== "mf" && ui.g !== "mf" && ui.g !== fi.g) { notes.push(fi.g === "m" ? "het is mannelijk (le / un)" : "het is vrouwelijk (la / une)"); coreV = "bijna"; }
  } else if (uArt) {
    notes.push("hier hoort geen lidwoord bij"); coreV = "bijna";
  }
  return { verdict: coreV, note: notes.join(", ") };
}

/** Frans antwoord verbeteren tegen één of meer Franse kaartteksten. */
export function gradeFr(answer, frList) {
  if (!baseNorm(answer)) return { verdict: "fout" };
  let best = { verdict: "fout" };
  for (const fr of frList) {
    for (const form of frForms(fr)) {
      const r = gradeOneFr(answer, form);
      if (RANK[r.verdict] > RANK[best.verdict]) best = { ...r, matched: fr };
      if (best.verdict === "juist") return best;
    }
  }
  return best;
}

function nlNorm(s) {
  return stripAccents(baseNorm(s)).replace(/^(de|het|een|'s)\s+/, "").replace(/'s\s+/g, "").trim();
}
export function nlForms(nl) {
  const forms = new Set();
  const parts = nl.split(/\s*[,/]\s*|\?\s+/).filter(Boolean);
  for (const p of [nl, ...parts]) for (const v of expandParens(p)) { const n = nlNorm(v); if (n) forms.add(n); }
  return [...forms];
}

/** Nederlands antwoord verbeteren (milder: lidwoord en accenten tellen niet). */
export function gradeNl(answer, nlList) {
  const a = nlNorm(answer);
  if (!a) return { verdict: "fout" };
  let typo = null;
  for (const nl of nlList) for (const f of nlForms(nl)) {
    if (a === f || a.replace(/-/g, " ") === f.replace(/-/g, " ")) return { verdict: "juist", matched: nl };
    if (!typo && f.length >= 5 && lev(a, f) <= 1) typo = nl;
  }
  if (typo) return { verdict: "juist", note: "kleine tikfout", matched: typo };
  return { verdict: "fout" };
}
