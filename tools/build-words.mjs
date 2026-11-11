// Zet bronnen/*.txt om naar words.json voor de app.
// Gebruik:  node tools/build-words.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "bronnen");
// Volgorde: handboek eerst zodat bij samenvoegen de handboekzin wint.
const files = readdirSync(srcDir).filter(f => f.endsWith(".txt")).sort((a, b) => (a.startsWith("bao") ? 1 : 0) - (b.startsWith("bao") ? 1 : 0));

const stripAccents = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => stripAccents(s.toLowerCase()).replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const frKey = fr => slug(fr
  .replace(/\((?:m|f|v)\.?(?:\s*\/\s*(?:f|v)\.)?(?:\s*pl\.)?\)/gi, "")
  .replace(/^(un|une|le|la|les|des)\s+/i, "")
  .replace(/^l'/i, ""));
const nlAlts = nl => nl.split(",").map(s => slug(s.replace(/\(.*?\)/g, "").replace(/^\s*(de|het|een)\s+/i, ""))).filter(Boolean);

const themes = [];
const words = [];
const problems = [];

for (const file of files) {
  let theme = null;
  readFileSync(join(srcDir, file), "utf8").split(/\r?\n/).forEach((line, i) => {
    line = line.trim();
    if (!line || (line.startsWith("#") && !line.startsWith("##"))) return;
    if (line.startsWith("##")) {
      const [id, title, source] = line.slice(2).split("|").map(s => s.trim());
      theme = { id, title, source };
      if (themes.some(t => t.id === id)) problems.push(`${file}:${i + 1} dubbel thema ${id}`);
      themes.push(theme);
      return;
    }
    const parts = line.split("|").map(s => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) { problems.push(`${file}:${i + 1} onvolledig: ${line}`); return; }
    if (!theme) { problems.push(`${file}:${i + 1} geen thema`); return; }
    const [fr, nl, ex = ""] = parts;
    const key = frKey(fr);
    const alts = nlAlts(nl);
    // samenvoegen: zelfde Frans woord en minstens één overlappende vertaling
    const twin = words.find(w => w._key === key && w._alts.some(a => alts.includes(a)));
    if (twin) {
      if (!twin.themes.includes(theme.id)) twin.themes.push(theme.id);
      const have = new Set(twin._alts);
      const extra = nl.split(",").map(s => s.trim()).filter(s => !have.has(nlAlts(s)[0]));
      if (extra.length) { twin.nl += ", " + extra.join(", "); twin._alts.push(...extra.flatMap(nlAlts)); }
      if (!twin.ex && ex) twin.ex = ex;
      return;
    }
    let id = `${key}~${alts[0] || "x"}`;
    while (words.some(w => w.id === id)) id += "+";
    words.push({ id, fr, nl, ex, themes: [theme.id], _key: key, _alts: alts });
  });
}

const out = {
  version: new Date().toISOString(),
  themes: themes.map(t => ({ ...t, count: words.filter(w => w.themes.includes(t.id)).length })),
  words: words.map(({ _key, _alts, ...w }) => w),
};
writeFileSync(join(root, "words.json"), JSON.stringify(out));
console.log(`${out.words.length} woorden in ${themes.length} thema's`);
for (const t of out.themes) console.log(`  ${t.count.toString().padStart(4)}  ${t.id}  ${t.title}`);
if (problems.length) { console.log("\nProblemen:"); problems.forEach(p => console.log("  " + p)); process.exitCode = 1; }
