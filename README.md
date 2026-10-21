# Kundenmonitor BTP

Neuentwicklung des SAP-GUI-Kundenmonitors `ZEC_CUSTOMER_MONITOR` (HYDAC eCommerce, Magento ↔ S/4HANA) als BTP-Anwendung.

| Schicht | Technologie |
|---|---|
| Frontend | SAPUI5 Freestyle, JavaScript, OData V4 Model |
| Service | SAP CAP (Node.js), OData V4 – Fassade zu S/4HANA |
| Backend | S/4HANA: bestehende Logik `ZCL_EC_CUSTOMER` + Schrittklassen, neuer Remote-Service (Phase 2) |
| Laufzeit | SAP BTP Cloud Foundry, XSUAA, Destination + Cloud Connector, HTML5 Repo / Work Zone (Phase 3) |

**Aktuelle Phase: 1 – Frontend gegen CAP-Mock-Service.** S/4 ist noch nicht angebunden; der CAP-Service liefert Testdaten und simuliert die Statuslogik anhand des Customizings.

## Dokumentation

| Datei | Inhalt | Lesen wenn … |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Arbeitsregeln für den Coding-Assistenten | immer zuerst |
| [docs/01_fachkonzept.md](docs/01_fachkonzept.md) | Prozessarten, Status, Schritte, Freigabe, Notifications (Ist-Logik) | fachliche Fragen, Statuslogik |
| [docs/02_architektur.md](docs/02_architektur.md) | Zielarchitektur BTP, Phasen, Entscheidungen | Struktur, Infrastruktur |
| [docs/03_service_vertrag.md](docs/03_service_vertrag.md) | CDS-Modell, OData-V4-Service, Actions, Fehlercodes, Mock-Verhalten | Service- oder UI-Datenzugriff |
| [docs/04_ui_spezifikation.md](docs/04_ui_spezifikation.md) | Screens, Felder, Aktionen, Dialoge, Status-Darstellung | UI-Implementierung |
| [docs/05_ui5_konventionen.md](docs/05_ui5_konventionen.md) | Projektstruktur, Coding-Standards, i18n, Tests | jeder Code-Change im Frontend |
| [docs/06_backlog.md](docs/06_backlog.md) | Arbeitspakete mit Akzeptanzkriterien | Planung, nächster Schritt |
| [docs/07_anforderungen_aus_altsystem.md](docs/07_anforderungen_aus_altsystem.md) | Befunde im Altsystem → Anforderungen an die Neuentwicklung | Design-Entscheidungen |
| [docs/08_demo_szenarien.md](docs/08_demo_szenarien.md) | Demo-Drehbuch: welcher Testvorgang zeigt welche Funktion | Demo vorbereiten |

Referenz Altsystem: Confluence EXTHYDAC › Australien › *Kundenmonitor (ZEC_CUSTOMER_MONITOR) – Technische und fachliche Dokumentation*
(https://techdivision.atlassian.net/wiki/spaces/EXTHYDAC/pages/2419851266)

## Lokal starten (Phase 1)

```bash
npm install
cds watch            # CAP-Service + Mock-Daten, UI unter http://localhost:4004/monitor/index.html
```

Anmeldung (Mock-Auth): `alice` / `alice` (Editor + Releaser, VKORG 0001/2000/7050) oder `bob` / `bob` (nur Anzeige, VKORG 0001).

```bash
npm run lint         # ui5lint + eslint
npm test             # jest (srv) + QUnit + OPA5 (headless, startet den Service selbst)
```

Details: [docs/05_ui5_konventionen.md](docs/05_ui5_konventionen.md#lokale-entwicklung).
