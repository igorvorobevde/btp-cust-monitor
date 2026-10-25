# Kundenmonitor BTP

Neuentwicklung des SAP-GUI-Kundenmonitors `ZEC_CUSTOMER_MONITOR` (HYDAC eCommerce, Magento ↔ S/4HANA) als BTP-Anwendung.

| Schicht | Technologie |
|---|---|
| Frontend | SAP Fiori Elements für OData V4 (`sap.fe.templates`, List Report + Object Page, FlexibleColumnLayout), JavaScript-Extensions |
| Service | SAP CAP (Node.js), OData V4 mit Draft – Fassade zu S/4HANA; UI-Semantik als CDS-Annotationen (Vertrag) |
| Backend | S/4HANA: bestehende Logik `ZCL_EC_CUSTOMER` + Schrittklassen, neuer Remote-Service (Phase 2) |
| Laufzeit | SAP BTP Cloud Foundry, XSUAA, Destination + Cloud Connector, HTML5 Repo / Work Zone, SAP HANA Cloud für Drafts und Replik (Phase 2/3) |

**Aktuelle Phase: 1 – Frontend gegen CAP-Mock-Service** (Phase 1b, Migration auf Fiori Elements, abgeschlossen – siehe [docs/09](docs/09_migration_fiori_elements.md)). S/4 ist noch nicht angebunden; der CAP-Service liefert Testdaten und simuliert die Statuslogik anhand des Customizings.

## Dokumentation

| Datei | Inhalt | Lesen wenn … |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Arbeitsregeln für den Coding-Assistenten | immer zuerst |
| [docs/01_fachkonzept.md](docs/01_fachkonzept.md) | Prozessarten, Status, Schritte, Freigabe, Notifications (Ist-Logik) | fachliche Fragen, Statuslogik |
| [docs/02_architektur.md](docs/02_architektur.md) | Zielarchitektur BTP, Phasen, Entscheidungen | Struktur, Infrastruktur |
| [docs/03_service_vertrag.md](docs/03_service_vertrag.md) | CDS-Modell, OData-V4-Service, Draft, Aktionen je Schritt, Fehlercodes, Codelisten, Mock-Verhalten | Service- oder UI-Datenzugriff |
| [docs/04_ui_spezifikation.md](docs/04_ui_spezifikation.md) | Fiori-Elements-Spezifikation: Liste, Detail, Bearbeiten, Schritte, Meldungen – als Annotationen | UI-Implementierung |
| [docs/05_ui5_konventionen.md](docs/05_ui5_konventionen.md) | Projektstruktur, Extensions, i18n, Tests | jeder Code-Change im Frontend |
| [docs/06_backlog.md](docs/06_backlog.md) | Arbeitspakete mit Akzeptanzkriterien | Planung, nächster Schritt |
| [docs/07_anforderungen_aus_altsystem.md](docs/07_anforderungen_aus_altsystem.md) | Befunde im Altsystem → Anforderungen an die Neuentwicklung | Design-Entscheidungen |
| [docs/08_demo_szenarien.md](docs/08_demo_szenarien.md) | Demo-Drehbuch: welcher Testvorgang zeigt welche Funktion | Demo vorbereiten |
| [docs/09_migration_fiori_elements.md](docs/09_migration_fiori_elements.md) | Architektur und Entscheidungen der Migration auf Fiori Elements (EN) | Warum Draft, Aktionen je Schritt, Replik in Phase 2 |

Referenz Altsystem: Confluence EXTHYDAC › Australien › *Kundenmonitor (ZEC_CUSTOMER_MONITOR) – Technische und fachliche Dokumentation*
(https://techdivision.atlassian.net/wiki/spaces/EXTHYDAC/pages/2419851266)

## Lokal starten (Phase 1)

```bash
npm install
cds watch            # CAP-Service + Mock-Daten, UI unter http://localhost:4004/monitor/index.html
```

Anmeldung (Mock-Auth): `alice` / `alice` (Editor + Releaser, VKORG 0001/2000/7050), `bob` / `bob` (nur Anzeige, VKORG 0001), `carol` / `carol` (Editor, für Sperrtests).

Deep-Links: `http://localhost:4004/monitor/index.html#/Requests(ID=<uuid>,IsActiveEntity=true)`; alte Links `#/requests/<uuid>` werden umgeschrieben.

```bash
npm run lint         # ui5lint + eslint (app/monitor)
npm test             # jest (srv) + OPA5-Journeys mit sap.fe.test (headless, startet den Service selbst)
scripts/fe-console.sh "test/debug.html#/Requests(ID=…,IsActiveEntity=true)"   # Konsolenfehler + Screenshot ohne Browserfenster
```

Hinweise: Entwürfe (Drafts) liegen im Mock im Speicher und sind nach einem Neustart weg; ein Entwurf sperrt den Vorgang für andere Benutzer 15 Minuten (verlängert bei jeder Änderung). Details: [docs/05_ui5_konventionen.md](docs/05_ui5_konventionen.md#9-lokale-entwicklung).
