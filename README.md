# Kundenmonitor BTP

Neuentwicklung des SAP-GUI-Kundenmonitors `ZEC_CUSTOMER_MONITOR` (HYDAC eCommerce, Magento ↔ S/4HANA) als BTP-Anwendung.

| Schicht | Technologie |
|---|---|
| Frontend | SAP Fiori Elements für OData V4 (`sap.fe.templates`, List Report + Object Page, FlexibleColumnLayout), JavaScript-Extensions |
| Service | SAP CAP (Node.js), OData V4 mit Draft – ab Phase 2 das führende System für die Vorgänge (E-15): Eingang aus Magento, Statusmaschine, Schritte, Notifications; UI-Semantik als CDS-Annotationen (Vertrag) |
| Backend | S/4HANA (on-premise und Public Cloud) nur über die Standard-API `API_BUSINESS_PARTNER` für Geschäftspartner, Debitor, Ansprechpartner, Warenempfänger – keine Z-Schnittstellen |
| Laufzeit | SAP BTP Cloud Foundry, XSUAA, Destination + Cloud Connector, HTML5 Repo / Work Zone, SAP HANA Cloud als persistente Datenbank (Vorgänge, Drafts, Customizing, Outbox; Phase 2/3) |

**Aktuelle Phase: 1 – Frontend gegen CAP-Mock-Service** (Phase 1b, Migration auf Fiori Elements, abgeschlossen – siehe [docs/09](docs/09_migration_fiori_elements.md)). S/4 ist noch nicht angebunden; der CAP-Service liefert Testdaten und simuliert die Statuslogik anhand des Customizings – diese Logik wird in Phase 2 die Produktivlogik.

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
| [docs/09_migration_fiori_elements.md](docs/09_migration_fiori_elements.md) | Architektur und Entscheidungen der Migration auf Fiori Elements (EN) | Warum Draft, Aktionen je Schritt, HANA als führendes System in Phase 2 (D-15) |
| [docs/10_s4_schnittstelle.md](docs/10_s4_schnittstelle.md) | Backend-Schnittstellen (Entwurf, E-15): Magento-Eingang, Schritte → `API_BUSINESS_PARTNER`, Notifications, Destinations, was in S/4 entfällt | Phase 2 mit HYDAC / TechDivision abstimmen |
| [docs/11_design_review_hydac.md](docs/11_design_review_hydac.md) | Design-Review für HYDAC IT (EN): Agenda, Fachdesign, BTP-Setup, Entscheidungen D1–D13, offene Fragen | Abstimmung mit HYDAC |
| [docs/12_solution_design.md](docs/12_solution_design.md) | Solution Design Document (EN) für HYDAC: Kontext, Bausteine, Laufzeit (Sequenzen, Statusmaschine), Integration, Sicherheit, Multi-Region, Betrieb, Architekturentscheidungen AD-01…AD-14, Risiken – mit Diagrammen | Architektur gegenüber HYDAC erklären |

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
npm run lint         # cds lint (db/, srv/, app/*/annotations.cds) + ui5lint + eslint (app/monitor)
npm test             # jest (srv) + OPA5-Journeys mit sap.fe.test (headless, startet den Service selbst)
scripts/fe-console.sh "test/debug.html#/Requests(ID=…,IsActiveEntity=true)"   # Konsolenfehler + Screenshot ohne Browserfenster
```

Deployment auf BTP (Cloud Foundry, HANA Cloud, Work Zone): `npx mbt build -t mta_archives` und `cf deploy mta_archives/kundenmonitor-btp_0.1.0.mtar`; Details in [docs/02_architektur.md](docs/02_architektur.md#7-deployment-auf-btp-o-02).

Hinweise: Entwürfe (Drafts) liegen im Mock im Speicher und sind nach einem Neustart weg; ein Entwurf sperrt den Vorgang für andere Benutzer 15 Minuten (verlängert bei jeder Änderung). Details: [docs/05_ui5_konventionen.md](docs/05_ui5_konventionen.md#9-lokale-entwicklung).
