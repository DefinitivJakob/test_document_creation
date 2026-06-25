# Backlog

## Stabilitäts-Tests Bild-Platzhalter

### ★ Multi-Word-Version Test (Priorität: hoch)

Templates in verschiedenen Word-Varianten erstellen und prüfen ob Alt-Text identisch im OOXML landet. Konkret testen:

- **Word für Mac** (aktuell verwendet) — Baseline
- **Word für Windows** (365 / 2019 / 2016) — andere Render-Engine, andere Defaults
- **Word Online (Browser)** — minimale OOXML-Variante
- **LibreOffice Writer** — falls Templates auch dort erstellt werden könnten

Zu prüfen pro Word-Version:
- Wird Alt-Text in `<wp:docPr descr="…">` UND `<pic:cNvPr descr="…">` geschrieben oder nur in einer Stelle?
- Numerische Entities (`&#xA;` Prefix wie bei Mac) oder anders kodiert?
- Compatibility-Wrappers (`<mc:AlternateContent>`) um Drawings?
- Attribut-Reihenfolge in `<wp:extent cx cy>` konsistent?
- Geht der Platzhalter-Bild-Pfad in DOCX vs DOCM vs DOTX?

→ Bei jeder Abweichung: Pre-Processor anpassen.

### Hybrid-Sizing Override verifizieren

Aktuell hat `data.json` für Fall 07 keine `breiteMm`/`hoeheMm`-Overrides — der Daten-Override-Pfad in `imgHelper.ts` ist ungetestet. Test-Daten so erweitern, dass einige Bilder explizit überschrieben werden, andere den Platzhalter-Default nutzen, und visuell prüfen.

### Echter Power-Automate-Roundtrip

Der `dataBase64`-Pfad in `imgHelper.ts` ist nie gelaufen. Realistische Test-Payload mit base64-kodierten PNGs durchschicken — vorzugsweise einmal über echtes Power Automate Flow, nicht nur simuliert.

### Orphan-Media-Cleanup im Pre-Processor

Wenn ein `<w:drawing>` durch einen Text-Command ersetzt wird, bleibt das referenzierte PNG (`word/media/imageN.png`) im ZIP zurück und bläht die Output-Datei auf. Cleanup einbauen:

1. Vor dem Replace: rId aus `<a:blip r:embed="rIdX"/>` extrahieren
2. Sammeln welche rIds entfernt werden
3. In `word/_rels/document.xml.rels` die `Target="media/imageN.png"` zu diesen rIds finden
4. Diese PNG-Dateien aus dem ZIP entfernen
5. Auch Rels-Einträge aufräumen

Hat Limits-relevanz für Power Automate (Datei-Größen-Cap).

### Edge-Cases Function-Call-Regex

Aktuelles Pattern `/^(.+?\()([\s\S]*)\)\s*$/` für Defaults-Injection bricht bei:
- Verschachtelten Funktions-Calls: `img(qrCode($foo))`
- String-Literalen mit Klammern: `img($b, "label(prio)")`

Robustere Lösung: über String-Tokenizer mit Klammern-Balance gehen statt Regex.

### Crop-/Skalierungs-Verhalten

Wenn ein User den Platzhalter in Word **croppt** oder **skaliert** (rechts-unten ziehen), zeigt `<wp:extent>` die Anzeige-Maße — was eigentlich gewollt ist. Aber: was passiert wenn die `<a:srcRect>` (Crop) gesetzt ist? Test-Case bauen.

## Funktionale Roadmap (offen)

### Fälle 03, 04, 08 noch nicht getestet
- 03 Nested Lists
- 04 Page-Keep mit IF
- 08 Bilder verschiedene Größen (sollte mit dem Hybrid-Sizing-Mechanismus direkt laufen)

### Azure Functions HTTP-Trigger
- `func init` / `func new`
- HTTP-Endpoint der `template` + `data` als JSON entgegennimmt
- Ausgabe als `application/vnd.openxmlformats-…document` zurück

### Power Automate Custom Connector
- Schema-Definition für PA
- Authentifizierung (Function-Key oder OAuth?)
- Multipart vs JSON-mit-base64 als Input-Format entscheiden

### Excel-Renderer
- `exceljs` o.ä. als Renderer-Implementierung
- Registry-Eintrag (`format: 'xlsx'`)
- Eigenes Test-Case-Verzeichnis

### CI/CD
- GitHub Actions: typecheck + Test-Render pro Case + Vergleich gegen Snapshot
- Deployment-Pipeline für Azure Function App

## Bekannte offene Punkte

### Issue #82 Upstream-PR
- Patch ist lokal angewendet via patch-package
- Issue-Text vorbereitet (siehe Konversation)
- TODO: Repo forken, Fix in `src/processTemplate.ts` portieren, PR aufmachen

### Wrapper-Logik konsolidieren
- `wrapAltChunks.ts` und `preprocessImagePlaceholders.ts` beide öffnen den ZIP einmal — könnte zu einem einzigen Pipeline-Step zusammengefasst werden für Performance
