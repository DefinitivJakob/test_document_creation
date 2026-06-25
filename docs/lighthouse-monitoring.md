# Monitoring-Zugriff für unit-ix freigeben (Azure Lighthouse)

**Diese Anleitung richtet sich an Sie als Kunde.** Sie beschreibt, wie Sie unit-ix einen
**read-only**-Einblick in die Application Insights der Document-Creation-Function in Ihrem
Azure-Tenant freigeben — über **Azure Lighthouse**. Es werden **keine Gastkonten** angelegt,
und Ihre Monitoring-Daten **verlassen Ihren Tenant nicht**.

## Was unit-ix dadurch erhält

- Zwei **reine Lese-Rollen** (Reader + Monitoring Reader) — **keinerlei Schreibrechte**.
- Beschränkt auf **genau eine Resource Group** (die der Function App) — nicht auf die ganze
  Subscription.
- **Jederzeit von Ihnen kündbar** (siehe [Zugriff entziehen](#zugriff-entziehen-jederzeit)).
- Die Telemetrie bleibt in **Ihrem** Tenant gespeichert; unit-ix liest sie nur bei Bedarf.

## Voraussetzungen (in Ihrem Tenant)

- Aktive Azure-Subscription mit der bereits eingerichteten Function App + Application Insights.
- Eine Person mit Rolle **Owner** oder **User Access Administrator** auf der Subscription
  (nötig, weil eine Rollenzuweisung erstellt wird).
- Resource Provider **Microsoft.ManagedServices** registriert
  (Subscription → **Resource providers** → ggf. **Register**).

## Von unit-ix erhalten Sie

Zwei Dateien — **bereits mit den unit-ix-Werten ausgefüllt** (Tenant-ID, Berechtigungsgruppe,
Rollen):

- `delegation.json` — die Vorlage
- `delegation.parameters.json` — die Parameter

> Bitte nur prüfen, dass der Wert **`rgName`** in `delegation.parameters.json` exakt die
> Resource Group Ihrer Function App ist. Sonst ist nichts anzupassen.

---

## Schritt 1 — Delegation deployen

Ausgeführt von einer Person mit **Owner** / **User Access Administrator**. Das Deployment
erfolgt auf **Subscription-Ebene**; die Beschränkung auf die eine Resource Group steckt
bereits in der Vorlage.

Im Azure-Portal:

1. Suche **„Deploy a custom template"** → **Build your own template in the editor**.
2. Inhalt von `delegation.json` einfügen → **Save**.
3. **Edit parameters** → Inhalt von `delegation.parameters.json` einfügen (oder die Felder
   manuell ausfüllen) → **Save**.
4. **Review + create** → **Create**.

---

## Schritt 2 — Freigabe prüfen

Im Azure-Portal:

1. Suche **„Service providers"** → **Service provider offers**.
2. Der Eintrag **„unit-ix Document Creation Monitoring"** muss gelistet sein.
3. Tab **Role assignments** → es stehen **Reader** und **Monitoring Reader** — beide read-only.

Damit ist die Freigabe aktiv (Wirksamkeit ggf. nach wenigen Minuten).

---

## Zugriff entziehen (jederzeit)

Sie behalten die volle Kontrolle und können die Freigabe jederzeit beenden:

- Portal → **Service providers** → **Delegations** → den Eintrag auswählen → **Remove**.

Damit endet der Zugriff von unit-ix sofort.

---

## Hinweise

- **Least privilege:** Es wird nur **eine Resource Group** delegiert, nicht die Subscription —
  und ausschließlich **Lese**-Rollen.
- **Kein Datenabfluss:** unit-ix *liest* die Telemetrie on-demand; gespeichert bleibt sie in
  Ihrem Tenant.
- **Voraussetzung App Insights:** workspace-based (Standard beim Setup) — die Lese-Rollen auf
  der Resource Group decken Application Insights + Log Analytics ab.
