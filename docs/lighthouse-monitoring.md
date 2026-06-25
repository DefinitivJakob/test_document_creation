# Monitoring-Zugriff via Azure Lighthouse

Wie wir (unit-ix) die **Application Insights der Function App im Kunden-Tenant**
(Mondi bzw. Test-Konto) **in unserem eigenen Azure-Portal** sehen — read-only, ohne
Tenant-Wechsel, ohne Gast-Login, ohne dass der Kunde irgendetwas zu uns rausschickt.

## Prinzip

**Azure Lighthouse** (Delegated Resource Management): Der Kunde („managed tenant")
delegiert genau eine Resource Group an unseren unit-ix-Tenant („managing tenant"). Wir
bekommen darauf zwei read-only-Rollen (**Reader** + **Monitoring Reader**). Danach erscheinen
die delegierten Ressourcen in unserem Portal unter **Azure Lighthouse → My customers** und
Application Insights/Log Analytics sind cross-tenant abfragbar.

Begriffe:
- **Managing tenant** = unit-ix (wir lesen).
- **Managed tenant** = Mondi / dein privates Test-Konto (delegiert).

Artefakte im Repo: [infra/lighthouse/delegation.json](../infra/lighthouse/delegation.json)
(ARM-Template) und [infra/lighthouse/delegation.parameters.json](../infra/lighthouse/delegation.parameters.json).

---

## Schritt 1 — Werte aus dem unit-ix-Tenant holen (managing)

Im **unit-ix**-Azure-Portal:

1. **Tenant-ID:** Microsoft Entra ID → **Overview** → **Tenant ID** kopieren
   → kommt in `managedByTenantId`.
2. **Principal (wer darf lesen):** Empfohlen eine **Security-Gruppe** (nicht ein Einzeluser),
   damit Zu-/Abgänge ohne erneutes Onboarding gehen.
   - Entra ID → **Groups** → Gruppe anlegen, z. B. `unit-ix Monitoring`, Mitglieder hinzufügen
   - die **Object ID** der Gruppe kopieren → kommt in `authorizations[].principalId`
   - *(Für einen schnellen Test reicht auch die Object ID deines unit-ix-Users:
     Entra ID → Users → dein User → Object ID.)*
3. **Rollen:** **Reader** (`acdd72a7-3385-48ef-bd42-f606fba81ae7`) **+** **Monitoring Reader**
   (`43d0d8ad-25c7-4714-9337-8ba259a9fe05`).
   ⚠️ **Reader ist Pflicht**, sonst erscheint die Delegation **nicht** unter „My customers"
   im Provider-Portal — Microsoft verlangt für diese Ansicht eine Rolle, die Reader-Zugriff
   *enthält*. Monitoring Reader allein reicht **nicht** (ist kein Superset von Reader). Beide
   sind read-only und nur auf die eine RG begrenzt.

Diese drei Werte in [delegation.parameters.json](../infra/lighthouse/delegation.parameters.json)
eintragen (`managedByTenantId`, `principalId`, ggf. `rgName`).

---

## Schritt 2 — Delegation deployen (im managed/Kunden-Tenant)

Macht jemand mit **Owner** oder **User Access Administrator** auf der Kunden-Subscription
(im Test: du selbst). Wird **auf Subscription-Ebene** deployed (die RG-Begrenzung steckt im
Template).

**Variante A — Azure Cloud Shell (im Portal, am robustesten):**
Portal des Kunden-Tenants → oben das **Cloud-Shell**-Icon (`>_`) → Bash → die beiden Dateien
hochladen (Upload-Button) oder per `git clone` holen, dann:
```bash
az deployment sub create \
  --name lighthouse-monitoring \
  --location germanywestcentral \
  --template-file delegation.json \
  --parameters @delegation.parameters.json
```

**Variante B — Portal „Deploy a custom template":**
Portal → Suche **„Deploy a custom template"** → **Build your own template in the editor** →
Inhalt von `delegation.json` einfügen → **Save** → Parameter (Tenant-ID, principalId, rgName)
ausfüllen → **Review + create**.

> Voraussetzung im Kunden-Tenant: Der Resource Provider **Microsoft.ManagedServices** muss
> registriert sein (Subscription → Resource providers → ggf. `Register`).

---

## Schritt 3 — Zugriff in unserem Portal prüfen (managing)

Im **unit-ix**-Portal, angemeldet als **Mitglied der delegierten Gruppe**:

1. **Richtige Directory:** oben rechts aufs Profil → **Switch directory** → **UNIT IX GmbH**.
2. **Subscription-Filter setzen** — ⚠️ der häufigste Grund, warum trotz funktionierender
   Delegation „nichts da" ist: delegierte Subscriptions sind im Portal standardmäßig oft
   **ausgefiltert**. Zahnrad **Settings → Directories + subscriptions** → die delegierte
   Subscription (z. B. „Azure for Students") **anhaken** (oder „Select all").
3. **Token aktuell?** Falls weiterhin leer: komplett **ab- und neu anmelden** (oder
   InPrivate-Fenster). Browser- und CLI-Token sind getrennt — das Browser-Token muss die
   Delegation/Gruppenmitgliedschaft enthalten. Propagation ~bis 15 Min.
4. **Ergebnis:** **Azure Lighthouse → My customers** zeigt die Subscription; bzw. globale
   Suche nach der App-Insights-Ressource (`mondi-test`) → **Live Metrics / Logs / Failures**.

Gegenprobe beim Kunden: Subscription → **Service providers → Service provider offers** → die
Delegation ist gelistet (Tab **Role assignments**: Reader + Monitoring Reader) und jederzeit
vom Kunden kündbar.

### Optional: per CLI verifizieren (eindeutiger Beweis)

Als unit-ix-User eingeloggt (`az login --tenant <unit-ix-tenant-id>`):
```bash
az account set --subscription <kunden-sub-id>
az group show -n rg-mondi-doc -o table                       # Reader -> liest die RG
az monitor app-insights query --app mondi-test -g rg-mondi-doc \
  --analytics-query "requests | summarize count() by name, tostring(resultCode)"
# Negativ-Test (read-only): MUSS mit AuthorizationFailed scheitern
az tag create --resource-id "/subscriptions/<kunden-sub-id>/resourceGroups/rg-mondi-doc" --tags x=1
```
Erscheint die Subscription bei `az account list --refresh` mit `homeTenantId` = Kunden-Tenant,
aber `tenantId` = unit-ix, läuft Lighthouse korrekt.

---

## Test vs. Mondi-Prod

| Test (privates Konto) | Mondi-Prod |
|---|---|
| Du deployst die Delegation selbst | Mondi-Admin deployt sie (Template + Parameter liefern wir) |
| principalId = ggf. dein unit-ix-User | principalId = Security-Gruppe `unit-ix Monitoring` |
| Rollen: Reader + Monitoring Reader | identisch (read-only); Scope nur die Function-RG |

---

## Hinweise

- **Least privilege:** Es wird nur die eine Resource Group delegiert, nicht die ganze
  Subscription, und nur eine Lese-Rolle.
- **Datenabfluss:** Wir *lesen* die Telemetrie on-demand in unserem Portal — die Daten
  bleiben im Kunden-Tenant gespeichert. Kein Export zu uns.
- **Voraussetzung App Insights:** workspace-based (so beim Setup angelegt) — Monitoring
  Reader auf der RG deckt App Insights + Log Analytics ab.

### „My customers" bleibt leer trotz korrekter Gruppe?
- **Häufigste Ursache:** der delegierten Gruppe fehlt die **Reader**-Rolle. „My customers"
  zeigt nur Delegationen mit Reader-Zugriff. Reader ergänzen und Delegation neu deployen.
- Danach **Token erneuern** (ab-/anmelden oder Browser-Refresh), ~bis 15 Min Propagation.
- **Subscription-Filter** prüfen: Portal oben → Filter → die delegierte Subscription darf
  nicht ausgeschlossen sein.
