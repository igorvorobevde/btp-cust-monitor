# 06 – Backlog

Reihenfolge = empfohlene Umsetzungsreihenfolge. Ein Item = ein Change-Set. Status pflegen: `offen` → `in Arbeit` → `erledigt`.

## Phase 1 – Frontend gegen CAP-Mock

### F-00 Projekt-Setup — erledigt
CAP-Projekt (Node.js) mit npm-Workspace `app/monitor`, UI5-App-Gerüst (Component, manifest, App-View mit FCL, i18n EN/DE), ESLint, `@ui5/linter`, Skripte gemäß 05 §8.
**AK:** `npm install && cds watch` startet fehlerfrei; App zeigt leere FCL-Shell mit Titel aus i18n; `npm run lint` grün.

### F-01 Datenmodell + Service-Definition — erledigt
`db/schema.cds`, `srv/monitor-service.cds` gemäß 03 §2–3. Feldlisten mit SE11-Export der Altstrukturen (`ZECSTR_CUSTOMER_MAIN_DYN`, `_ADMIN_DYN`, `_SALES_DYN`, `ZECSTR_CUSTOMER_SHIPTO`) abgleichen; Abweichungen in 03 dokumentieren.
**AK:** `cds compile srv` ohne Fehler; `$metadata` enthält Entitäten, `availableSteps`, `executeStep`, ETag auf Requests; CREATE/DELETE auf Requests → 405.

### F-02 Mock-Daten + Customizing-CSV — erledigt
CSV für Statuses (+ `_texts` DE/EN/FR/IT), ProcessTypes, Steps (+ `_texts` DE/EN/FR/IT/NL/SV), ProcessSteps, ApprovalRules (Stand 01), MockBusinessPartners, 13 Testvorgänge (03 §7) inkl. salesData/admin/shipTo und Logeinträgen.
**AK:** `GET /Requests?$expand=status,salesData,admin,shipTo` liefert 13 Vorgänge; Texte wechseln mit `Accept-Language`.

### F-03 Statusmaschine im Mock — erledigt
`srv/lib/status-machine.js` (rein, ohne CAP-Abhängigkeit) + Handler `availableSteps`/`executeStep` inkl. Fehlercodes (03 §5), Logeinträgen, `modifiedAt`, Freigabe-Neuprüfung bei CNG_NEW.
**AK:** Jest-Tests decken je Prozessart Erfolg, Fehlerstatus, `CONFIRM_REQUIRED`, `STEP_ABORTED`, `BP_NOT_CUSTOMER`, RESET-Sonderfall, 412 ab.

### F-04 Liste mit Filtern — erledigt
List-View gemäß 04 §2 inkl. Default-Filter (ohne 8xx/9xx), Zählung, Sortierung, Hinweis-Icons, Highlight.
**AK:** Alle Filter wirken (OPA prüft mind. Status, Prozessart, „Abgelehnte einbeziehen“); Zeilenklick öffnet Detail; Filterzustand bleibt beim Zurücknavigieren erhalten.

### F-05 Detail lesend — erledigt
ObjectPage gemäß 04 §3 (Header, Abschnitte, Sichtbarkeit nach Prozessart, Protokoll), Deep-Link, Vollbild/Schließen.
**AK:** Für CR_WE sind Admin-Abschnitt ausgeblendet und Warenempfänger sichtbar, für alle anderen umgekehrt; Deep-Link `#/requests/<id>` lädt direkt.

### F-06 Bearbeiten und Sichern — erledigt
Gemäß 04 §4.1 mit Update-Gruppe `changes`, Pending-Changes-Schutz bei Navigation, 412-Behandlung.
**AK:** Änderung + Sichern erzeugt Logeinträge je Feld; parallele Änderung (zweiter Tab) führt zu 412-Dialog und Reload; Abbrechen verwirft.

### F-07 Schrittausführung — erledigt
`StepService.js` + Menü + Dialoge gemäß 04 §4.2.
**AK:** Jeder Schritt aus 01 §6 ist über die UI ausführbar; `CONFIRM_REQUIRED` führt zu Rückfrage und zweitem Aufruf mit `force`; Prozessartwechsel blendet Abschnitte um; Fehlerstatus wird als Warning angezeigt.

### F-08 Meldungen und Fehlerbehandlung — erledigt
Messaging + MessagePopover, `ErrorHandler.js` für 5xx/Netzwerk.
**AK:** Meldungen aus `sap-messages` erscheinen im Popover; Service gestoppt → verständliche Fehlermeldung, keine Konsolen-Exceptions.

### F-09 Tests und Qualität — erledigt
QUnit (formatter, FilterBuilder, StepService-Mapping), OPA-Journeys: Liste filtern → Detail → Bearbeiten/Sichern → Schritt REJECT.
**AK:** `npm test` grün; `npm run lint` ohne Fehler.

### F-10 Feinschliff — in Arbeit
Leerzustände, Busy-Indikatoren, Tastaturbedienung, Tooltips für Icon-Spalten, Responsiveness (Popin).
*Stand:* Leerzustände, Busy (ObjectPage/Schritt-Button, Delay 0), Tooltips Hinweis-Icons, Popin umgesetzt. Offen: Review Tastaturbedienung, Test-Starter-Migration der Testseiten (ui5lint-Warnung).

**Hinweise zur Umsetzung F-00–F-09 (19.10.2026):**
- F-01: Abgleich mit SE11-Export der Altstrukturen steht noch aus (Export liegt nicht vor) – Feldlisten = Entwurf aus 03.
- F-01: Vertragsergänzungen ETag auf Kind-Entitäten und rollenabhängiges `isEditable` (siehe 03 §3).
- F-09: Jest 47 Tests (Statusmaschine + Service), QUnit 16, OPA 9 (Liste/Filter, Deep-Link, Bearbeiten inkl. Kind-Feld, 412-Konflikt, REJECT, CONFIRM_REQUIRED + force).

## Phase 2 – S/4-Anbindung (Vorschau, wird detailliert wenn Phase 1 steht)

- B-01 Entscheidung E-07 (RAP vs. SEGW) und Schnittstellenentwurf S/4.
- B-02 Refactoring Schrittklassen: Popups → Eingabeparameter (`ZIF_EC_CUSTOMER` erweitern).
- B-03 S/4-Service: Liste, Detail, Update mit Änderungsprotokoll, `availableSteps`, `executeStep`, Versionszähler für ETag.
- B-04 CAP-Delegation (`cds import` des S/4-Service, Remote-Service-Handler), Destination, Cloud Connector, Principal Propagation.
- B-05 Wertehilfen, Link „Geschäftspartner anzeigen“.

## Phase 3 – Betrieb (Vorschau)

- O-01 `xs-security.json` (Rollen, Attribut SalesOrg), Rollen-Collections.
- O-02 `mta.yaml`, HTML5 Repo, Managed Approuter, Work-Zone-Kachel.
- O-03 Logging/Monitoring, Transportweg (CTMS o. ä.).
