# Frans oefenen

Web-app om dagelijks 5 à 10 minuten Franse woordenschat te oefenen, op Android en iPad.

## Installeren op het toestel

1. Open het webadres van de app (GitHub Pages, zie onder).
2. **iPad (Safari):** tik op Delen › *Zet op beginscherm*.
   **Android (Chrome):** menu ⋮ › *App installeren* of *Toevoegen aan startscherm*.
3. Open de app voortaan via het icoon. Op de iPad is dat belangrijk: alleen dan blijft de voortgang bewaard.

## Hoe werkt het oefenen?

- **Dagsessie:** ongeveer 20 kaartjes. Eerst komen de foute woorden die terug moeten komen, daarna nieuwe woorden.
  - Juist: het woord komt niet snel terug.
  - Fout of bijna: het woord komt terug in een van de 3 volgende sessies, tot het juist is.
- **Oefen thema:** een of meer thema's volledig doorlopen, bijvoorbeeld voor een toets. Foute woorden komen achteraan terug.
- **Mondeling:** zeg het antwoord luidop, toon het antwoord en duid zelf juist, bijna of fout aan.
- **Schriftelijk:** typ het antwoord.
  - Een fout accent, een vergeten of fout lidwoord (le/la) of een kleine schrijffout telt als "bijna".
  - Nederlandse antwoorden worden milder verbeterd.
- **Ouders** (⚙️): overzicht, makkelijke en moeilijke woorden, meldingen van fouten, instellingen, en voortgang bewaren of laden.

## Voortgang overzetten tussen gsm en iPad

De voortgang staat alleen op het toestel. Zo zet je ze over:

1. Ga op het ene toestel naar Ouders › Instellingen › **Voortgang bewaren**, en stuur of bewaar het bestand.
2. Kies op het andere toestel **Voortgang laden**.

Doe dit ook af en toe als back-up.

## Nieuwe woorden toevoegen

Geef Claude foto's, scans of een PDF van de nieuwe woordenlijst. Claude:

1. zet ze om naar een tekstbestand in `bronnen/`;
2. voert `node tools/build-words.mjs` uit;
3. zet de app opnieuw online.

De voortgang blijft behouden.

Het formaat van de bronbestanden:

```
## thema-id | Titel van het thema | Bron
Frans | Nederlands (komma = meerdere juiste antwoorden) | voorbeeldzin
```

## Bestanden

| Bestand | Inhoud |
|---|---|
| `index.html`, `style.css`, `app.js` | de app |
| `grade.js` | de verbetering van antwoorden (tests: `node tools/test-grade.mjs`) |
| `words.json` | de woordenlijst, gemaakt uit `bronnen/*.txt` |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline gebruik en het icoon op het startscherm |

Foto's en PDF's blijven lokaal en gaan niet online (zie `.gitignore`).
