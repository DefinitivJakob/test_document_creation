# Mondi Document Creation Tool

Kundenspezifisches Deployment des Dokument-Renderers für **Mondi**, getriggert via Power
Automate. Befüllt Word-Templates mit Daten und schickt das fertige Dokument zurück. Läuft
als Azure Function **im Mondi-Tenant** — keine Cross-Tenant-Requests.

Basiert auf [docx-templates](https://github.com/guigrpa/docx-templates) mit eigenen
Wrappern für Bild-Platzhalter, HTML-Encoding und einem Patch für ein Library-Bug bei
verschachtelten Tabellen.

> Abgeleitet vom generischen Multi-Kunden-Master (unit-ix). Die PDF-Render-Maschinerie
> ist vorhanden, aber es ist **noch kein PDF-Layout registriert** — der DOCX-Pfad
> (`/api/render`) ist voll funktionsfähig. Ein Mondi-Layout wird bei Bedarf in
> [src/document/pdf/layoutRegistry.ts](src/document/pdf/layoutRegistry.ts) eingetragen.

## Quick Start

```bash
npm install
npm run typecheck
npm run build
```

Lokaler Function-Host: `npm start` (führt clean + build aus und startet `func start`).

## Doku

- [docs/architecture.md](docs/architecture.md) — Wie der Renderer aufgebaut ist, Wrapper-Pipeline, Library-Patch
- [docs/power-automate-integration.md](docs/power-automate-integration.md) — Power-Automate-Flow gegen die Function
- [docs/template-authoring.md](docs/template-authoring.md) — Best Practices fürs Erstellen von Word-Templates
- [docs/BACKLOG.md](docs/BACKLOG.md) — Offene Stabilitäts-Tests und Roadmap

## Troubleshooting (Template geht nicht)

Wenn ein Template + Beispiel-JSON fehlschlägt:

```bash
# Material in einen Ordner legen, dann:
npm run troubleshoot -- /pfad/zum/download
```

Der Runner erkennt DOCX (template.docx + data.json) automatisch, validiert die JSON und
gibt bei Fehlern die **echte Ursache** aus — inklusive der Stelle im Code. Bei PDF wird
der Fehler sichtbar gemacht, den react-pdf intern verschluckt (Details:
[src/installErrorCapture.ts](src/installErrorCapture.ts)).

## Anforderungen

- Node ≥ 22
- npm

Der `postinstall: patch-package` Hook patched docx-templates automatisch (Fix für
[Issue #82](https://github.com/guigrpa/docx-templates/issues/82) bei FOR-Loops in
verschachtelten Tabellen).

## Scripts

| Script | Zweck |
|---|---|
| `npm run typecheck` | TypeScript-Check ohne Build |
| `npm run build` | Build nach `dist/` (inkl. Asset-Copy) |
| `npm start` | Lokaler Azure-Functions-Host |
</content>
# test_document_creation
