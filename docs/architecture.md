# Architecture

Wie der Renderer aufgebaut ist, was wir gegenüber der nackten docx-templates Library hinzugefügt haben und warum.

## Zielsetzung

Ein generischer Dokument-Renderer, der über Power Automate getriggert wird und Word- (später auch Excel-) Dokumente aus Templates + Daten erzeugt. Die docx-templates Library macht 80 % des Hebens, deckt aber einige reale Anforderungen nicht ab — diese werden vom Wrapper geschlossen.

## Format-Registry

Eingangspunkt ist immer der Renderer-Lookup über das Format-Feld der Anfrage:

- [src/document/types.ts](../src/document/types.ts) — `DocumentRenderer`-Interface, `RenderInput`/`RenderResult`-Typen, `RenderError`
- [src/document/registry.ts](../src/document/registry.ts) — `getRenderer(format)` Dispatcher

Damit ist die Library austauschbar: ein zukünftiger Excel-Renderer (z.B. via `exceljs`) registriert sich einfach als zweiter Eintrag.

## DOCX-Pipeline

Im Kern führt der DOCX-Renderer [src/document/docx/docxRenderer.ts](../src/document/docx/docxRenderer.ts) drei Stufen aus:

```
Template (Buffer) ──▶ Pre-Process Images ──▶ docx-templates.createReport ──▶ Post-Process altchunks ──▶ Output
```

1. **Pre-Process Images** — alt-text Platzhalter umschreiben (siehe unten)
2. **createReport** — die eigentliche docx-templates Verarbeitung mit Custom-Delimiter und Defaults
3. **Post-Process altchunks** — HTML-Fragmente in vollständige HTML5-Dokumente wrappen

## Konfiguration von `createReport`

Wir setzen feste Defaults für alle Renders:

```ts
{
  cmdDelimiter: ['$[[', ']]'],
  failFast: false,
  rejectNullish: false,
  ...callerOptions  // additionalJsContext etc. kommen vom Test-Runner / Function-Trigger
}
```

### Warum `$[[ ]]` als Delimiter?

Default ist `+++…+++`, ebenfalls möglich `{{…}}` und `${…}`. Wir haben uns gegen alle drei entschieden:

- **`+++`** ist im Fließtext schwer zu sehen / zu tippen
- **`{{ }}`** kollidiert mit Mustache-/Handlebars-Konventionen (Power Automate Output-Token verwenden auch `{{}}` an manchen Stellen)
- **`${ }`** kollidiert mit JavaScript-Template-Literals und Object-Literals — die Library erlaubt JS-Expressions inline, und ein `}` in z.B. `{key: 'val'}` würde den Command vorzeitig schließen

`$[[ ]]` ist sichtbar, eindeutig, kollidiert mit keiner JS-Syntax und keiner Word-/PA-Konvention. Wert hat sich beim Testen mehrfach bewiesen.

### `failFast: false`

Sammelt alle Render-Fehler statt beim ersten zu sterben. Im Wrapper geben wir den ersten Fehler als `RenderError` weiter, weitere Fehler stecken im `.cause`-Feld zum Debuggen.

### `rejectNullish: false`

Lässt `null`/`undefined`-Werte im Template als leeren Text rendern statt zu werfen. Robuster für Power-Automate-Daten, wo optionale Felder fehlen können.

## Wrapper-Komponenten

### 1. Pre-Process Image Placeholders

[src/document/docx/helpers/preprocessImagePlaceholders.ts](../src/document/docx/helpers/preprocessImagePlaceholders.ts)

**Problem**: docx-templates erlaubt zwar `$[[IMAGE expr]]` als Text-Command, gibt aber keinen Weg, ein **visuelles Platzhalter-Bild im Word-Template** zu verwenden. Template-Bauen ohne visuelles Feedback ist unhandlich.

**Lösung**: Pre-Processor scannt das Template-OOXML nach `<w:drawing>`-Elementen, deren Alt-Text (`<wp:docPr descr="…">`) einen Command enthält. Solche Drawings werden durch einen Text-Run mit dem Command ersetzt. Vorher werden die Platzhalter-Dimensionen (aus `<wp:extent cx cy>`, EMU → mm) als zusätzliches Argument in den Command injiziert.

```
Alt-Text:  $[[img($b)]]
        ↓
Text-Run:  $[[IMAGE img($b, {placeholderWidthMm: 50, placeholderHeightMm: 30})]]
```

- `IMAGE`-Keyword wird automatisch ergänzt, falls weggelassen (Alt-Text auf Bildern ergibt nur als IMAGE Sinn)
- Bearbeitet werden `word/document.xml`, alle `word/headerN.xml`, alle `word/footerN.xml`
- Numerische XML-Entities (`&#xA;`) werden korrekt dekodiert (Word fügt manchmal Newline-Prefixes ein)

### 2. Image Helper

[src/document/docx/helpers/imgHelper.ts](../src/document/docx/helpers/imgHelper.ts)

**Problem**: docx-templates `IMAGE`-Command erwartet ein Objekt mit `{width, height, data, extension}`. Das per Hand zu bauen ist mühsam, und Bauplaner-Daten kommen in mm statt cm.

**Lösung**: `makeImgHelper({ baseDir })` produziert eine `img(spec, defaults)`-Funktion, die im `additionalJsContext` registriert wird. Sie:

- Lädt Bild-Daten aus zwei Quellen: `spec.datei` (Dateipfad relativ zu `baseDir`, lokale Tests) oder `spec.dataBase64` (Power Automate später)
- Rechnet mm → cm um (Library erwartet cm)
- Hybrid-Sizing mit Precedence: Daten (`spec.breiteMm`/`hoeheMm`) > Platzhalter-Defaults (vom Pre-Processor injiziert) > Fallback 50 mm
- Extension wird aus dem Dateinamen abgeleitet

### 3. Post-Process altchunks (HTML)

[src/document/docx/helpers/wrapAltChunks.ts](../src/document/docx/helpers/wrapAltChunks.ts)

**Problem**: docx-templates `HTML`-Command erzeugt OOXML-`altchunk`-Dateien (`word/template_document_xml_html<N>.html`) mit rohem HTML ohne Doctype, ohne `<meta charset>`. Word liest diese auf macOS dann mit MacRoman-Encoding → UTF-8-Bytes werden zu Mojibake (`Ü` → `√ú`) und Word verlangt "Datei reparieren" beim Öffnen.

**Lösung**: Nach `createReport` öffnen wir den DOCX-ZIP, packen jeden altchunk-Inhalt in einen vollständigen HTML5-Wrapper:

```html
<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>…original…</body></html>
```

- Bereits gewrappte Inhalte werden erkannt und übersprungen (idempotent)
- Templates und Daten bleiben encoding-agnostisch — Power Automate schickt einfach den HTML-Inhalt ohne Wrapper

## Library-Patch via patch-package

[patches/docx-templates+4.15.0.patch](../patches/docx-templates+4.15.0.patch)

**Problem**: FOR-Loops in verschachtelten Tabellen entfernten die gesamte innere Tabelle aus dem Output (siehe [docx-templates #82](https://github.com/guigrpa/docx-templates/issues/82)). Ursache war eine Schutz-Logik in `processTemplate.js`, die nie greift, weil sie `nodeIn._children.filter(c => c._tag === 'w:tr')` aufruft — aber ein `<w:tr>` hat nur `<w:tc>`-Kinder, nie weitere `<w:tr>`. Damit war der Filter immer leer, der Schutz nie aktiv, und Outer-Rows mit Nested-Tables wurden entfernt.

**Fix**: Statt der toten Logik prüfen wir, ob irgendeine Zelle der Output-Row eine `<w:tbl>` enthält:

```js
fRemoveNode = !nodeOut._children.some(cell =>
  !cell._fTextNode && cell._tag === 'w:tc' &&
  cell._children.some(child => !child._fTextNode && child._tag === 'w:tbl')
);
```

- `nodeOut` statt `nodeIn`, weil `nodeIn` bei verschachtelten FOR-Loops mitten in der Iteration auf andere Stellen im Template-Baum zeigt
- Konsistent mit dem direkt darunter stehenden Cell-Check (`tag === 'w:tc'`), der ebenfalls `nodeOut._children` für `<w:tbl>` prüft

Patch wird automatisch beim `npm install` über `postinstall: patch-package` angewendet. Upstream-PR steht noch aus.

## Test-Runner

[src/runTest.ts](../src/runTest.ts) ist die lokale Variante des späteren Azure-Function-Triggers. Er:

1. Liest `test-cases/<name>/template.docx` und `data.json`
2. Baut ein simuliertes Power-Automate-Payload (template als base64, data als JSON) via [src/simulateInput.ts](../src/simulateInput.ts)
3. Holt sich den passenden Renderer aus der Registry
4. Erzeugt einen `img()`-Helper mit dem Test-Case-Verzeichnis als `baseDir`
5. Übergibt den Helper via `options.additionalJsContext` an den Renderer
6. Schreibt das Ergebnis nach `test-cases/<name>/output.docx`

Aufruf: `npm test -- <case-name>`.

## Datenfluss in einem typischen Render

```
data.json ──┐
            ├──▶ simulateInput ──▶ { templateBase64, data }
template.docx ─┘                          │
                                          ▼
                                 docxRenderer.render({
                                   template: <Buffer>,
                                   data,
                                   options: { additionalJsContext: { img } }
                                 })
                                          │
              ┌───────────────────────────┼────────────────────────────┐
              ▼                           ▼                            ▼
   preprocessImagePlaceholders   createReport(docx-templates)   wrapAltChunkHtmlDocuments
   - Drawing → Text-Command      - FOR/IF/INS/IMAGE/HTML        - HTML5-Wrapper
   - Größen aus Platzhaltern     - Patch: nested tables         - UTF-8 explizit
                                          │
                                          ▼
                                      output.docx
```

## Was bewusst NICHT abstrahiert wird

- **OOXML-Parsing**: weder die Patches noch der Pre-Processor verwenden einen XML-Parser, sondern regex-basierte String-Manipulation. Reason: schnell, keine zusätzlichen Dependencies, ausreichend solange Word-Output strukturell stabil bleibt. Risiko-Stellen sind im [BACKLOG](./BACKLOG.md) dokumentiert.
- **Template-Validation**: wir lehnen kein Template ab, das fehlerhafte Commands enthält — docx-templates' eigenes Error-Reporting reicht. Falsche Commands kommen als `RenderError` zurück.
- **Image-Optimization**: Bilder werden nicht komprimiert oder skaliert. Größe ist Sache des Auftraggebers.

## Roadmap

Siehe [BACKLOG.md](./BACKLOG.md) für offene Punkte (Multi-Word-Tests, Orphan-Cleanup, Excel-Renderer, Azure-Functions-Trigger usw.).
