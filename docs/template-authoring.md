# Template Authoring — Best Practices

Wie du Word-Templates baust, die mit diesem Renderer zuverlässig laufen.

## Inhalt

1. [Commands & Delimiter](#commands--delimiter)
2. [Variablen einfügen](#variablen-einfügen)
3. [FOR-Schleifen](#for-schleifen)
4. [IF-Bedingungen](#if-bedingungen)
5. [Tabellen mit Loops](#tabellen-mit-loops)
6. [Verschachtelte Tabellen](#verschachtelte-tabellen)
7. [HTML-Inhalt einbetten](#html-inhalt-einbetten)
8. [Bilder einbinden](#bilder-einbinden)
9. [Seitenwechsel-Steuerung](#seitenwechsel-steuerung)
10. [Häufige Fallen](#häufige-fallen)

---

## Commands & Delimiter

Alle Commands stehen in `$[[ ]]`. Der Default `+++…+++` der Library wird **nicht** verwendet.

```
$[[command oder expression]]
```

Verfügbare Commands:

| Command | Was es macht |
|---|---|
| `$[[variable]]` | Wert einer Variable als Text einfügen (implizit `INS`) |
| `$[[INS expr]]` | Wie oben, explizit |
| `$[[EXEC expr]]` oder `$[[! expr]]` | JavaScript ausführen ohne Output |
| `$[[IF cond]] … $[[END-IF]]` | Inhalt nur einfügen wenn Bedingung wahr |
| `$[[FOR x IN list]] … $[[END-FOR x]]` | Schleife über Array |
| `$[[IMAGE expr]]` | Bild einfügen (expr muss Image-Spec-Objekt liefern) |
| `$[[HTML variable]]` | HTML-Fragment einfügen |
| `$[[LINK expr]]` | Hyperlink einfügen |

## Variablen einfügen

Top-Level-Daten (direkt aus dem JSON-Objekt) — **ohne** `$`-Prefix:

```
Hallo $[[name]], heute ist der $[[datum]].
```

Innerhalb einer FOR-Schleife — die aktuelle Loop-Variable **mit** `$`-Prefix:

```
$[[FOR person IN team]]
  $[[$person.name]]
$[[END-FOR person]]
```

Tiefe Pfade gehen direkt: `$[[firma.adresse.ort]]`. Auch JS-Expressions: `$[[name.toUpperCase()]]`.

## FOR-Schleifen

### Grundform

```
$[[FOR punkt IN tagesordnung]]
• $[[$punkt.titel]]
$[[END-FOR punkt]]
```

- Loop-Variable **ohne** `$` in der FOR-Zeile selbst (`FOR punkt IN …`)
- Innerhalb der Schleife immer **mit** `$` (`$punkt.titel`)
- Die `END-FOR`-Anweisung muss den **gleichen Namen** referenzieren

### Verschachtelt

```
$[[FOR abschnitt IN abschnitte]]
  $[[$abschnitt.titel]]
  $[[FOR item IN $abschnitt.items]]
    • $[[$item.name]]
  $[[END-FOR item]]
$[[END-FOR abschnitt]]
```

Beachte: Die Source der inneren Schleife (`$abschnitt.items`) verwendet `$abschnitt`, weil sie schon innerhalb der äußeren Schleife steht.

### Loop-Index `$idx`

Innerhalb der innersten Schleife ist `$idx` der aktuelle Index (0-basiert):

```
$[[FOR z IN zeilen]]
  Zeile $[[$idx + 1]]: $[[$z.text]]
$[[END-FOR z]]
```

### Defensive Fallbacks für optionale Arrays

Wenn nicht jedes Item das Array-Feld hat (z.B. `subitems` optional), gibt's einen "Invalid FOR command (can only iterate over Array)" Fehler. Workaround: JS-Fallback im Source:

```
$[[FOR s IN ($i.subitems || [])]]
  ▪ $[[$s.text]]
$[[END-FOR s]]
```

## IF-Bedingungen

```
$[[IF $person.aktiv]]
  $[[$person.name]] ist aktiv
$[[END-IF]]
```

**Wichtig**: docx-templates kennt **kein `ELSE`**. Für gegenseitig ausschließende Fälle zwei IF-Blöcke:

```
$[[IF $person.aktiv]]
  aktiv
$[[END-IF]]
$[[IF !$person.aktiv]]
  inaktiv
$[[END-IF]]
```

## Tabellen mit Loops

### Konvention: FOR/END-FOR in eigene gemergte Zeilen

**Für Lesbarkeit und Wartbarkeit**: FOR-Anfang und FOR-Ende immer in eigenen Tabellenzeilen, deren Zellen über die volle Breite gemergt sind. NICHT in derselben Zeile wie der Loop-Body.

```
┌────────────────────────────────────────────┐
│ Nr.       │ Beschreibung │ Status          │   ← Header
├────────────────────────────────────────────┤
│ $[[FOR z IN zeilen]]            (gemergt)  │   ← Loop-Start
├────────────────────────────────────────────┤
│ $[[$z.nr]]│ $[[$z.text]] │ $[[$z.status]]  │   ← Loop-Body
├────────────────────────────────────────────┤
│ $[[END-FOR z]]                  (gemergt)  │   ← Loop-Ende
└────────────────────────────────────────────┘
```

In Word einrichten:
1. Tabelle einfügen, gewünschte Anzahl Spalten × 4 Zeilen
2. Zeile 2: alle Zellen markieren → Tabelle → "Zellen verbinden" → FOR rein
3. Zeile 3 bleibt mehrspaltig (Loop-Body)
4. Zeile 4: ebenfalls verbinden → END-FOR rein

## Verschachtelte Tabellen

Funktionieren — der Renderer hat einen Patch für [docx-templates Issue #82](https://github.com/guigrpa/docx-templates/issues/82). Eine innere Tabelle mit eigenem FOR-Loop in einer Zelle einer äußeren Tabelle wird korrekt geklont und gefüllt.

Konvention für Tabellen-Loops gilt auch hier (FOR/END-FOR in gemergten Zeilen).

Beispiel-Struktur:

```
$[[FOR a IN abschnitte]]
┌──────────────────────────┬───────────────────┐
│ $[[$a.titel]]            │ [innere Tabelle]  │
│                          │                   │
│ Inhalt links             │                   │
└──────────────────────────┴───────────────────┘
$[[END-FOR a]]
```

## HTML-Inhalt einbetten

Für formatieren Text (fett, kursiv, Listen, Links, Tabellen) verwende den `HTML`-Command:

```
$[[HTML beschreibung]]
```

mit `beschreibung` in den Daten z.B. als:

```json
"beschreibung": "<p>Das ist <b>fett</b> und <i>kursiv</i>.</p>"
```

### Wichtig
- **HTML-Strings als Daten-Variable übergeben**, nicht inline als JS-Template-Literal — auch wenn unser Delimiter `$[[ ]]` keine Kollision mit `${}` hat, ist die Variable-Variante übersichtlicher
- **Block-Element**: HTML-Inhalt rendert in einem eigenen Absatz. Inline-HTML im Fließtext (Text + HTML im selben Absatz) funktioniert nicht zuverlässig — der ganze HTML-Block landet auf einer eigenen Zeile
- **Encoding wird automatisch korrekt gewrappt** durch unseren Post-Processor — du brauchst keine `<meta charset>` oder Doctype in den Daten, der Wrapper ergänzt das
- **`altchunk`-Mechanik** funktioniert nur in **Microsoft Word**, nicht in LibreOffice oder Google Docs

## Bilder einbinden

Es gibt zwei Modi, beide unterstützt:

### A) Alt-Text-Platzhalter (empfohlen für visuelles Layout)

In Word ein Bild einfügen (Größe & Position für Layout korrekt setzen), Rechtsklick → **Alternativtext bearbeiten** → Command eintragen:

```
$[[IMAGE img($bild)]]
```

Das `IMAGE`-Keyword wird auch automatisch ergänzt, wenn du nur `img($bild)` schreibst.

Beim Rendern:
- Der Pre-Processor liest die Platzhalter-Dimensionen und übergibt sie als Default an den `img()`-Helper
- Das eigentliche Bild wird an der Position des Platzhalters eingefügt

### B) Text-Command (für rein datengetriebene Größen)

Im Fließtext oder in einer Tabellenzelle direkt:

```
$[[IMAGE img($bild)]]
```

Bei Text-Commands muss `IMAGE` **explizit** dabei sein (sonst wird's als `INS` interpretiert und wirft "Result is an object").

### Bild-Daten in `data.json`

```json
{
  "bild": {
    "datei": "fundament-1.png",
    "breiteMm": 50,
    "hoeheMm": 30
  }
}
```

Felder:

| Feld | Bedeutung |
|---|---|
| `datei` | Dateiname relativ zum Test-Case-Verzeichnis (lokale Tests) |
| `dataBase64` | Vorab kodierte Image-Daten (Power-Automate-Pfad) |
| `breiteMm` | Optional, Breite in mm — überschreibt Platzhalter-Default |
| `hoeheMm` | Optional, Höhe in mm — überschreibt Platzhalter-Default |

Sizing-Precedence: **Daten > Platzhalter-Default > 50 mm Fallback**

## Seitenwechsel-Steuerung

Wenn Hauptpunkte + ihre Unterpunkte zusammen auf einer Seite bleiben sollen (nicht halb-halb aufgeteilt werden), sind drei Word-Absatzstile nötig:

| Stil | "Absätze nicht trennen" (`keepNext`) | "Zeilen nicht trennen" (`keepLines`) |
|---|---|---|
| Hauptpunkt-keep | ✓ | ✓ |
| Unterpunkt-keep | ✓ | ✓ |
| Unterpunkt-last | ✗ | ✓ |

Im Template via IF unterscheiden:

```
$[[FOR punkt IN tagesordnung]]
[Hauptpunkt-keep] • $[[$punkt.titel]]
$[[FOR sub IN $punkt.unterpunkte]]
$[[IF $idx !== $punkt.unterpunkte.length - 1]]
[Unterpunkt-keep] o $[[$sub]]
$[[END-IF]]
$[[IF $idx === $punkt.unterpunkte.length - 1]]
[Unterpunkt-last] o $[[$sub]]
$[[END-IF]]
$[[END-FOR sub]]
$[[END-FOR punkt]]
```

Logik: Der letzte Unterpunkt eines Blocks bekommt ein anderes Absatzformat (kein `keepNext`), damit der Seitenwechsel **nach** dem Block erlaubt ist — aber innerhalb des Blocks alles zusammenhängt.

## Häufige Fallen

### Command-Text zersplittert in mehrere Runs

Word teilt einen Command intern manchmal in mehrere Text-Runs auf (typisch wenn du mittendrin Formatierung änderst oder Autokorrektur eingreift). Die Library kommt damit meist klar, in nicht-trivialen Fällen aber nicht.

**Fix**: Command markieren → Format → Zeichenformatierung löschen (`⌃+Space` auf Mac, `Ctrl+Leer` auf Win). Notfalls: kompletten Command löschen und in einem Zug neu tippen.

### Smart Quotes statt geraden Quotes

Word ersetzt `"` automatisch durch `"` `"`. In JS-Expressions führt das zu Syntax-Fehlern.

**Fix**: entweder Auto-Korrektur in Word abschalten, oder im Renderer die Option `fixSmartQuotes: true` setzen.

### `${…}` statt `$[[…]]`

Häufiger Tippfehler. Der Renderer prüft auf `$[[`/`]]` als Delimiter. `${…}` bleibt im Output stehen, ohne ersetzt zu werden.

### Loop-Variable groß statt klein

`$[[FOR I IN …]]` mit großem `I` und Body mit `$[[$i.text]]` (klein) → ReferenceError, weil `$i` nicht definiert ist. Case-Sensitive. Konsistent halten.

### Falsches Keyword (`in` statt `IN`)

Die Command-Keywords (`FOR`, `IN`, `END-FOR`, `IF`, `END-IF`, `IMAGE`, `INS`, `HTML`) sind **case-sensitive groß**. `$[[FOR x in arr]]` → Invalid FOR command.

### Kein `IMAGE`-Keyword bei Text-Commands

`$[[img($bild)]]` als Fließtext-Command wirft "Result of command is an object". `IMAGE` voranstellen: `$[[IMAGE img($bild)]]`. Im Alt-Text-Modus wird's automatisch ergänzt.

### IF ohne ELSE

Wenn du `$[[ELSE]]` ins Template schreibst: Fehler. docx-templates hat kein ELSE — zwei IF-Blöcke schreiben (siehe oben).

### Fehlende `|| []` bei optionalen Arrays

`$[[FOR s IN $i.subitems]]` wenn nicht jedes Item `subitems` hat → "Invalid FOR command (can only iterate over Array)". Mit Fallback: `$[[FOR s IN ($i.subitems || [])]]`.

### Word setzt Newline-Prefix in Alt-Texten

Wenn du im Alt-Text Enter drückst, fügt Word einen `&#xA;` (LF) vor deinem Command ein. Wird vom Pre-Processor automatisch getrimmt. Wenn du den Command aber an der ersten Stelle hast (ohne Leerzeichen davor), ist alles fine.
