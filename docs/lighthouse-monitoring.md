# Monitoring-Zugriff via Azure Lighthouse

Wie wir (unit-ix) die **Application Insights der Function App im Kunden-Tenant**
(Mondi bzw. Test-Konto) **in unserem eigenen Azure-Portal** sehen — read-only, ohne
Tenant-Wechsel, ohne Gast-Login, ohne dass der Kunde irgendetwas zu uns rausschickt.

## Prinzip

**Azure Lighthouse** (Delegated Resource Management): Der Kunde („managed tenant")
delegiert genau eine Resource Group an unseren unit-ix-Tenant („managing tenant"). Wir
bekommen darauf eine RBAC-Rolle (**Monitoring Reader** = read-only). Danach erscheinen die
delegierten Ressourcen in unserem Portal unter **Azure Lighthouse → My customers** und
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
3. **Rolle:** bleibt **Monitoring Reader** (`43d0d8ad-25c7-4714-9337-8ba259a9fe05`).
   Reicht für Application Insights + Log Analytics lesen. *(Mehr Kontext per `Reader`
   `acdd72a7-3385-48ef-bd42-f606fba81ae7`, falls auch andere Ressourcen sichtbar sein sollen.)*

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

Im **unit-ix**-Portal:
1. Suche **„Azure Lighthouse"** → **My customers** → die delegierte Subscription/RG erscheint
   (ggf. wenige Minuten Verzug).
2. Application Insights ansehen: oben im **Directory + Subscription**-Filter die delegierte
   Subscription mit anhaken → dann ganz normal die App-Insights-Ressource öffnen
   (**Live Metrics**, **Logs/KQL**, **Failures**). Kein Tenant-Wechsel nötig.

Gegenprobe beim Kunden: Subscription → **Service providers** (bzw. **Service provider offers**)
→ die Delegation ist gelistet und jederzeit vom Kunden kündbar.

---

## Test vs. Mondi-Prod

| Test (privates Konto) | Mondi-Prod |
|---|---|
| Du deployst die Delegation selbst | Mondi-Admin deployt sie (Template + Parameter liefern wir) |
| principalId = ggf. dein unit-ix-User | principalId = Security-Gruppe `unit-ix Monitoring` |
| Rolle: Monitoring Reader | identisch (read-only); Scope nur die Function-RG |

---

## Hinweise

- **Least privilege:** Es wird nur die eine Resource Group delegiert, nicht die ganze
  Subscription, und nur eine Lese-Rolle.
- **Datenabfluss:** Wir *lesen* die Telemetrie on-demand in unserem Portal — die Daten
  bleiben im Kunden-Tenant gespeichert. Kein Export zu uns.
- **Voraussetzung App Insights:** workspace-based (so beim Setup angelegt) — Monitoring
  Reader auf der RG deckt App Insights + Log Analytics ab.
