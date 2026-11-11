// Snelle tests voor de verbetering.  node tools/test-grade.mjs
import { gradeFr, gradeNl } from "../grade.js";

const cases = [
  // [fn, antwoord, verwachting, kaart(en), verwacht oordeel]
  ["fr", "la sœur", ["la sœur"], "juist"],
  ["fr", "la soeur", ["la sœur"], "juist"],
  ["fr", "une sœur", ["la sœur"], "juist"],
  ["fr", "le sœur", ["la sœur"], "bijna"],
  ["fr", "soeur", ["la sœur"], "bijna"],
  ["fr", "l'ete", ["l'été (m.)"], "bijna"],
  ["fr", "l'été", ["l'été (m.)"], "juist"],
  ["fr", "un été", ["l'été (m.)"], "juist"],
  ["fr", "une été", ["l'été (m.)"], "bijna"],
  ["fr", "le foot", ["le foot(ball)"], "juist"],
  ["fr", "le football", ["le foot(ball)"], "juist"],
  ["fr", "beau", ["beau, belle"], "juist"],
  ["fr", "beau, belle", ["beau, belle"], "juist"],
  ["fr", "joli", ["beau, belle", "joli, jolie"], "juist"],
  ["fr", "dans", ["dans (la classe)"], "juist"],
  ["fr", "dans la classe", ["dans (la classe)"], "juist"],
  ["fr", "ne pas", ["ne ... pas"], "juist"],
  ["fr", "ne...pas", ["ne ... pas"], "juist"],
  ["fr", "vingt et un", ["vingt-et-un"], "bijna"],
  ["fr", "chercer", ["chercher"], "bijna"],
  ["fr", "trouver", ["chercher"], "fout"],
  ["fr", "les gants", ["les gants (m.)"], "juist"],
  ["fr", "des gants", ["les gants (m.)"], "juist"],
  ["fr", "le gant", ["les gants (m.)"], "bijna"],
  ["fr", "lunettes", ["des lunettes (f.)"], "bijna"],
  ["fr", "Qui?", ["qui?"], "juist"],
  ["fr", "s'il te plait", ["s'il te plait (s.t.p.)"], "juist"],
  ["fr", "s’il te plaît", ["s'il te plait (s.t.p.)"], "bijna"],
  ["fr", "le vtt", ["le vélo tout-terrain, le V.T.T."], "juist"],
  ["fr", "le velo tout terrain", ["le vélo tout-terrain, le V.T.T."], "bijna"],
  ["fr", "la fille", ["un garçon"], "fout"],
  ["fr", "le v.t.t.", ["le vélo tout-terrain, le V.T.T."], "juist"],
  ["fr", "imprimée", ["imprimé(e)"], "juist"],
  ["fr", "", ["être"], "fout"],
  ["nl", "zus", ["de zus"], "juist"],
  ["nl", "een zus", ["de zus"], "juist"],
  ["nl", "tellen", ["tellen, rekenen"], "juist"],
  ["nl", "rekenen", ["tellen, rekenen"], "juist"],
  ["nl", "wat voor", ["welk? wat voor?"], "juist"],
  ["nl", "neef", ["de neef (zoon van tante/oom)"], "juist"],
  ["nl", "blokfluit", ["de (blok)fluit"], "juist"],
  ["nl", "fluit", ["de (blok)fluit"], "juist"],
  ["nl", "grootvadr", ["een grootvader"], "juist"],
  ["nl", "moeder", ["de vader"], "fout"],
  ["nl", "smorgens", ["de ochtend, 's ochtends"], "fout"],
  ["nl", "'s ochtends", ["de ochtend, 's ochtends"], "juist"],
];

let fails = 0;
for (const [kind, ans, cards, want] of cases) {
  const r = kind === "fr" ? gradeFr(ans, cards) : gradeNl(ans, cards);
  const ok = r.verdict === want;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FOUT"} ${kind} "${ans}" vs ${JSON.stringify(cards)} -> ${r.verdict}${r.note ? " (" + r.note + ")" : ""}${ok ? "" : "  verwacht " + want}`);
}
console.log(fails ? `\n${fails} mislukt` : "\nalles ok");
process.exitCode = fails ? 1 : 0;
