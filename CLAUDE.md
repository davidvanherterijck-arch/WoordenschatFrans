# Frans oefenen — werkafspraken

Web-app (PWA) voor Warre (1e middelbaar) om Franse woordenschat te oefenen.
Live: https://davidvanherterijck-arch.github.io/WoordenschatFrans/ (GitHub Pages vanaf `main`, root).
Uitleg voor gebruikers: `LEESMIJ.md`.

## Nieuwe woordenschat toevoegen

1. Foto, scan of PDF → `bronnen/<bron>.txt` in het bestaande formaat (`## thema-id | Titel | Bron`, daarna `Frans | Nederlands | voorbeeldzin`).
2. `node tools/build-words.mjs`
3. `node tools/test-grade.mjs` en `node tools/check-words.mjs`: beide moeten slagen.
4. Commit en push naar `main`.
5. Wacht tot de live `words.json` het nieuwe aantal woorden toont.

## Vaste regels

- Enkel woordenschat: geen volledige zinnen of uitdrukkingen als kaartje. Vraagwoorden (qui?), samengestelde woorden (une pomme de terre) en vaste combinaties (avoir peur de) mogen wel. Voorbeeldzinnen horen in de derde kolom.
- Volg de spelling van de bron (rectificaties 1990, bv. *la flute*, *connaitre*) en neem de vertalingen van het handboek over zoals ze er staan.
- Verbeter leesfouten zelf. Vraag David enkel iets bij echte twijfel: onleesbaar, handschrift of een vermoedelijke fout in de bron.
- Commit nooit foto's of PDF's van het handboek (staan in `.gitignore`).
- Wijzig woord-id's niet onnodig: de voortgang op het toestel hangt eraan. Een id wordt gevormd uit het Franse woord en de eerste vertaling.
