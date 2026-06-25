# Power Automate Integration

Schritt-für-Schritt-Anleitung, wie ein Power-Automate-Flow die Render-Function aufruft. Eingabe: ein Docx-Template aus SharePoint + JSON-Daten. Ausgabe: ein gerendertes Word-Dokument (optional als PDF konvertiert).

## Voraussetzungen

- Function-Endpoint: `https://<FUNCTION-APP-NAME>.<REGION>.azurewebsites.net/api/render`
  (konkreter Wert wird in der Azure-Phase festgelegt — Function App in der Mondi-Subscription)
- Function Key: aus der Mondi Function App (Portal → Function → App keys) generieren und
  sicher hinterlegen — nicht in dieses Repo committen
- Docx-Template in SharePoint/OneDrive, dessen Platzhalter zu den übergebenen Daten passen (siehe [template-authoring.md](template-authoring.md))

## Flow-Aufbau

### 1. Trigger

Beliebig — z. B. „When an item is created" (SharePoint), Button, HTTP-Request o. Ä.

### 2. Template aus SharePoint holen

Action: **SharePoint → Get file content**

| Feld | Wert |
|---|---|
| Site Address | URL der SharePoint-Site |
| File Identifier | Pfad zur Template-Datei (z. B. `/Shared Documents/Templates/Angebot.docx`) |

→ Output `body('Get_file_content')` enthält die Binär-Bytes des Templates.

### 3. Daten zusammenstellen (optional)

Action: **Compose** oder mehrere **Initialize variable**

Hier baust du das `data`-Objekt zusammen, das die Template-Variablen befüllt. Quellen: Trigger-Output, Dataverse, weitere SharePoint-Lookups etc.

### 4. HTTP-Request an die Function

Action: **HTTP**

| Feld | Wert |
|---|---|
| Method | `POST` |
| URI | `https://<FUNCTION-APP-NAME>.<REGION>.azurewebsites.net/api/render` |
| Headers | `Content-Type: application/json` <br> `x-functions-key: <FUNCTION_KEY>` |

**Body:**

```json
{
  "template": "@{base64(body('Get_file_content'))}",
  "data": {
    "angebot": {
      "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "angebotsnummer": "ANG-2025-0042",
      "kundennummer": "KD-0017",
      "datum": "19.05.2025",
      "betreff": "Sanierung Badezimmer EG",
      "istNachtrag": false,
      "status": "entwurf"
    },
    "empfaenger": {
      "name": "Müller Immobilien GmbH"
    },
    "projekt": {
      "id": "proj-xyz",
      "titel": "ARE Deutzen – Block A",
      "beschreibung": "Vollsanierung Wohneinheiten 1–4"
    },
    "positionen": [
      {
        "posNr": 1,
        "typ": "leistung",
        "bezeichnung": "Fliesenlegen Bad",
        "menge": "8",
        "einheit": "Std.",
        "einzelpreisNetto": "65,00",
        "gesamtpreisNetto": "520,00"
      },
      {
        "posNr": 2,
        "typ": "material",
        "bezeichnung": "Bodenfliesen 60×60 Grau",
        "menge": "12",
        "einheit": "m²",
        "einzelpreisNetto": "28,50",
        "gesamtpreisNetto": "342,00"
      }
    ],
    "summen": {
      "zwischensummeNetto": "862,00",
      "rabattProzent": 5,
      "rabattBetrag": "43,10",
      "nettoNachRabatt": "818,90",
      "mwstProzent": 19,
      "mwstBetrag": "155,59",
      "gesamtbetragBrutto": "974,49"
    }
  },
  "format": "docx"
}
```

**Wichtig:**

- `template` wird als base64-encodete Binärdatei erwartet. Der Ausdruck `@{base64(body('Get_file_content'))}` macht die Konvertierung in Power Automate.
- `data` muss strukturell zu den Platzhaltern im Template passen. Stimmen Felder nicht überein, antwortet die Function mit `500` und einer `RENDER_ERROR`-Message

### 5. Response verarbeiten

Die Function antwortet bei Erfolg mit Status `200` und folgendem Body:

```json
{
  "file": "UEsDBBQABg...",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "bytes": 21062
}
```

`file` ist der gerenderte Docx als base64-String.

### 6. Docx in SharePoint/OneDrive speichern

Action: **SharePoint → Create file** (oder OneDrive-Pendant)

| Feld | Wert |
|---|---|
| Site Address | Ziel-Site |
| Folder Path | Zielordner (z. B. `/Shared Documents/Generated`) |
| File Name | z. B. `Angebot-@{triggerOutputs()?['body/Title']}.docx` |
| File Content | Expression: `base64ToBinary(body('HTTP')?['file'])` |

## Optional: PDF statt Docx

Direkt nach Schritt 6 anhängen:

Action: **Word Online (Business) → Convert Word Document to PDF**

| Feld | Wert |
|---|---|
| Location | OneDrive/SharePoint (gleicher Speicherort wie eben) |
| Document Library | je nach Setup |
| File | das eben erstellte Docx (Output von „Create file") |

→ Output enthält PDF-Bytes. Anschließend wieder **Create file** mit `.pdf`-Endung, um das PDF zu speichern.

> Wenn die Original-Docx nicht aufbewahrt werden soll, lässt sich das Zwischen-Docx danach mit **Delete file** entfernen.

## Referenzen

- Template-Syntax und unterstützte Konstrukte: [template-authoring.md](template-authoring.md)
- Architektur und Rendering-Pipeline: [architecture.md](architecture.md)
- Beispiel-Daten pro Test-Case: `test-cases/<case>/data.json`
