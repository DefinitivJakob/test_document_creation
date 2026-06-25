# Azure Setup — Function App Deployment

Komplettes Runbook, wie die Document-Creation-Function in Azure aufgesetzt und per
GitHub Actions deployed wird. Getestet auf einem privaten Azure-Konto; die Unterschiede
zum echten Mondi-Betrieb stehen in [Teil D](#teil-d--test-vs-mondi-prod).

## Kontext

Mondi erlaubt **keine Cross-Tenant-HTTP-Requests**. Die Function läuft deshalb **in der
Mondi-Subscription/im Mondi-Tenant** — Power Automate ruft sie tenant-intern auf (DLP-
konform). Diese Anleitung baut genau dieses Setup auf: alles im Azure-Portal + GitHub-Web
(„Frontend"), Deployment via **OIDC** (Entra ID), ohne gespeicherte Deploy-Secrets.

## Voraussetzungen

- **Azure-Subscription** — Pflicht. Ohne aktive Subscription lässt sich keine Function App,
  kein Storage und kein Application Insights anlegen.
  - Im Test: privates Azure-Konto.
  - Bei Mondi: deren Subscription im Mondi-Tenant.
- **GitHub-Repo** mit diesem Code. Push auf `main` deployt automatisch.
- **Berechtigungen** im Azure-Tenant: App-Registrierungen anlegen *und* Rollen zuweisen
  (z. B. Rolle *Owner* oder *Contributor* + *Application Administrator*). Das Deployment
  Center erledigt App-Registrierung, Federated Credential und GitHub-Secrets automatisch —
  vorausgesetzt, der ausführende Benutzer hat diese Rechte.

---

## Teil A — Ressourcen anlegen (Azure-Portal)

Der Function-App-Wizard legt **Storage und Application Insights gleich mit an**.

1. [portal.azure.com](https://portal.azure.com) → **Create a resource** → nach **Function App** suchen → **Create**.
2. **Select a hosting option** → **Flex Consumption** → **Select**.
3. Tab **Basics**:
   - **Subscription:** die Ziel-Subscription
   - **Resource Group:** **Create new**, z. B. `rg-mondi-doc`
   - **Function App name:** z. B. `mondi-doc` (global eindeutig, wird Teil der URL)
   - **Region:** z. B. `Sweden Central`
   - **Runtime stack:** **Node.js**
   - **Version:** **22 LTS**
   - **Instance size:** Default
4. Tab **Storage:** Default (neuer Storage Account wird vorgeschlagen).
5. Tab **Networking:** für den Test Default (public). *(Mondi-Prod ggf. VNet/Private Endpoint.)*
6. Tab **Monitoring:**
   - **Enable Application Insights:** **Yes**
   - **Application Insights:** **Create new**
7. **Review + create** → **Create** → **Go to resource**.

**Ergebnis:** Function App (`mondi-doc`), Storage Account, Application Insights + Log
Analytics Workspace.

---

## Teil B — Deployment einrichten (Deployment Center, GitHub + OIDC)

> **Warum nicht Publish-Profile?** Flex Consumption hat **kein Kudu/SCM-Endpoint**. Jedes
> Publish-Profile-basierte Deployment scheitert deshalb mit
> `Failed to fetch Kudu App Settings. Unauthorized (CODE: 401)`. Der unterstützte Weg ist
> **OIDC** (Entra ID). Das Deployment Center wickelt das vollständig automatisch ab.

1. Function App → **Deployment Center** → **Source: GitHub** → GitHub autorisieren →
   **Organization / Repository / Branch = `main`** wählen → **Add a workflow** (Preview).
2. **Save**. Azure legt dabei automatisch an:
   - eine **App-Registrierung** in Entra ID,
   - ein **Federated Credential** (Entity = Branch `main`),
   - drei **GitHub-Secrets** im Repo: `AZUREAPPSERVICE_CLIENTID_…`, `…_TENANTID_…`, `…_SUBSCRIPTIONID_…`,
   - und committet den Workflow `.github/workflows/main_<app-name>.yml` ins Repo.

3. **Zwei Pflicht-Korrekturen am generierten Workflow** (sonst schlägt der Build fehl):

   **a) `npm run test --if-present` entfernen.** Unser `test`-Script
   ([scripts/runTest.ts](../scripts/runTest.ts)) rendert einen Fixture-Case und braucht ein
   Argument + den `dev-fixtures`-Branch → ohne Argument `process.exit(1)` → roter Build.

   **b) Eine evtl. vorhandene eigene `deploy.yml` löschen.** Sonst laufen zwei Workflows und
   deployen doppelt bei jedem Push.

   *(Optional, empfohlen:)* `npm run typecheck` vor dem Build ergänzen — fängt TS-Fehler früh.

   Der `build`-Step sieht danach so aus:
   ```yaml
         - name: 'Resolve Project Dependencies Using Npm'
           shell: bash
           run: |
             pushd './${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}'
             npm install
             npm run typecheck
             npm run build --if-present
             popd
   ```

4. Commit → **Actions** läuft:
   - `build`: `npm install` (führt `postinstall: patch-package` aus → docx-templates-Patch),
     `typecheck`, `build` (tsc → `dist/`), Zip (inkl. `node_modules`, `dist/`, `host.json`).
   - `deploy`: `azure/login@v2` via OIDC → `Azure/functions-action@v1` (erkennt Flex
     Consumption automatisch, deployt per One-Deploy).

**Warum das funktioniert (Kompatibilität mit unserem Repo):**
- `npm install` → `patch-package` patcht docx-templates ✔
- `npm run build` → `tsc` + `copyAssets` erzeugen `dist/` ✔
- Zip enthält `node_modules` (mit gepatchter Lib), `dist/`, `host.json`, `package.json` ✔
- `slot-name: 'Production'` = Default-Slot, unkritisch.

> Falls `deploy` doch an einem fehlenden Build scheitert: im Workflow
> `Azure/functions-action` um `remote-build: true` ergänzen (Azure baut dann serverseitig
> per Oryx).

---

## Teil C — Testen

**1. Smoke-Test (Portal):** Function App → **Functions** → `render` → **Code + Test** →
**Test/Run** → Method `POST`, Body `{}` → **Run** → erwartet **400** `BAD_REQUEST`
(„'template' … required"). Beweist, dass die Function live ist und antwortet.

**2. End-to-End (Power Automate, das eigentliche Kunden-Frontend):** Flow nach
[power-automate-integration.md](power-automate-integration.md) bauen
(Get file content → HTTP POST an die Function-URL inkl. `?code=<key>` → Create file).

**3. Beobachten (Application Insights):** App-Insights-Ressource → **Live Metrics** (Echtzeit),
**Logs** (KQL), **Failures**.
```kql
traces  | where message contains "Rendered" | order by timestamp desc
requests| order by timestamp desc | take 20
```

Function-Key holen: Function App → `render` → **Get function URL** (URL enthält `?code=…`).

---

## Teil D — Test vs. Mondi-Prod

| Test (privates Konto) | Mondi-Prod |
|---|---|
| Eigene Subscription | **Mondi-Subscription** im Mondi-Tenant |
| Deployment Center richtet OIDC ein | identisch (OIDC, kein Secret) ✔ |
| App Insights direkt sichtbar | **Azure Lighthouse**-Delegation → wir sehen Mondis App Insights read-only, ohne Gast-Account |
| Networking: public | ggf. VNet / Private Endpoint nach Mondi-Vorgabe |
| Test per HTTP/Portal | Power Automate ruft **tenant-intern** auf → kein Cross-Tenant |
| Beide PDF-Layouts entfernt, nur DOCX | bei Bedarf Mondi-eigenes PDF-Layout in [layoutRegistry.ts](../src/document/pdf/layoutRegistry.ts) ergänzen |

---

## Anhang — Lessons Learned

- **Publish-Profile → 401 auf Flex Consumption.** Kein Kudu/SCM vorhanden. Lösung: OIDC via
  Deployment Center (richtet alles automatisch ein).
- **Generierter Workflow enthält `npm run test --if-present`.** Mit unserem `test`-Script
  (braucht Argument) → Build rot. Zeile entfernen.
- **Federated Credential muss zum Workflow passen.** Der Deployment-Center-Workflow nutzt
  *kein* `environment:`, daher Credential auf **Branch `main`** — wird automatisch korrekt
  gesetzt. (Hätte der Workflow `environment: production`, müsste das Credential auf
  *Environment = production* stehen, sonst erneut Auth-Fehler.)
