// Controleert words.json:  node tools/check-words.mjs
// 1. Elk woord aanvaardt zijn eigen antwoord als juist (Frans en Nederlands, elk alternatief, met en zonder haakjes).
// 2. Geen volledige zinnen of uitdrukkingen: de app oefent enkel woordenschat.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeFr, gradeNl } from "../grade.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { words } = JSON.parse(readFileSync(join(root, "words.json"), "utf8"));
const errors = [], warnings = [];

for (const w of words) {
  for (const a of new Set([w.fr, w.fr.split(",")[0], w.fr.replace(/\(.*?\)/g, "")])) {
    const r = gradeFr(a, [w.fr]);
    if (r.verdict !== "juist") errors.push(`antwoord FR "${a}" → ${r.verdict}${r.note ? ` (${r.note})` : ""}`);
  }
  for (const a of new Set([w.nl, ...w.nl.split(",")])) {
    const r = gradeNl(a, [w.nl]);
    if (r.verdict !== "juist") errors.push(`antwoord NL "${a.trim()}" bij ${w.fr} → ${r.verdict}`);
  }
  const fr = w.fr.replace(/\(.*?\)/g, "").replace(/\s+([?!.])/g, "$1").trim();
  const n = fr.split(/\s+/).filter(x => /\w/.test(x)).length;
  const last = fr.split(/(?<=[!?])\s+/).pop(); // "quel! quelle!" = twee losse woorden
  const lastN = last.split(/\s+/).filter(x => /\w/.test(x)).length;
  const endsLikeSentence = (/[.!]$/.test(last) && !/\b[A-Z]\.$/.test(last) && lastN >= 2) // "V.T.T." is een afkorting
    || (/\?$/.test(last) && lastN >= 3);
  const startsWithSubject = /^(je|j'|tu|il|elle|on|nous|vous|ils|elles|c'est|ce)\b/i.test(fr) && !/^il (y a|faut)\b/i.test(fr);
  if (endsLikeSentence || (startsWithSubject && n >= 3)) errors.push(`zin? "${w.fr}" = ${w.nl}`);
  else if (n > 5) warnings.push(`lang (${n} woorden): "${w.fr}" = ${w.nl}`);
}

console.log(`${words.length} woorden gecontroleerd`);
if (warnings.length) { console.log(`\nNakijken (${warnings.length}):`); warnings.forEach(x => console.log("  " + x)); }
if (errors.length) { console.log(`\nFouten (${errors.length}):`); errors.forEach(x => console.log("  " + x)); process.exitCode = 1; }
else console.log("alles ok");
