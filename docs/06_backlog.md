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

## Phase 1b – Migration auf SAP Fiori Elements (Entscheidung 22.10.2026, siehe [09](09_migration_fiori_elements.md))

Backend-Items zuerst (F-11–F-15, additiv bis auf F-12), FE-App parallel in `app/monitor-fe`, Cutover in F-21. Spike S1–S14 aus 09 §8 läuft auf einem Wegwerf-Branch parallel zu F-11/F-12 und ist Voraussetzung für F-16. F-10 wird mit F-22 abgeschlossen.

### F-11 Vertrag: Codelisten, berechnete Felder, Wertehilfen — erledigt
`db/schema.cds`: `processTypeRef`, `releaseStateRef`, `statusGroup`, `statusCriticality`, `orderCriticality`, `releaseCriticality`, `releaseState` (stored), `LogEntries.criticality`, `Statuses.criticality`; Entitäten `StatusGroups`, `ReleaseStates` (+ `_texts` DE/EN); Service: `StatusGroups`, `ReleaseStates`, `SalesOrganizations` (`@restrict where`), `Sources` (`@cds.redirection.target: false`); CSV gemäß 09 §4.5; 03 §2/§3/§8.
**AK:** `cds compile srv` fehlerfrei; `GET /Requests?$filter=statusGroup eq 'OPEN'&$orderby=statusCriticality desc&$expand=processTypeRef,releaseStateRef` liefert Texte je `Accept-Language`; `releaseState` #1 = `NOT_REL`, #2 = `NOT_RELEASED`, #3 = `AUTOMATIC`; `SalesOrganizations` für `bob` nur `0001`; bestehende Jest-Tests grün.

### F-12 Draft-Bearbeitung (E-12) — erledigt
`@odata.draft.enabled` auf `Requests`, `@UI.UpdateHidden: editHidden`, `log` als Assoziation, `before EDIT` (`NOT_EDITABLE`), `before NEW` (405), Änderungsprotokoll bei Aktivierung (Root + Kinder, deep), manuelle If-Match-Prüfung entfernt, `cds.fiori`-Timeouts, DE-Texte für `DRAFT_*`, Mock-User `carol`; Jest „Draft editing“, „Draft lock“, „Edit guards“; 03 §3/§6, 02 E-05/E-12/§2.
**AK:** `$metadata`: Key `ID,IsActiveEntity`, `Common.DraftRoot`, keine `LogEntries_drafts`; `draftEdit` #6 (mit If-Match) → 201, PATCH `name` + `salesData/salesGroup` auf dem Draft, `draftActivate` → 200 mit je Feld einem Logeintrag, Drafts gelöscht, `modifiedAt` von Vorgang und `salesData` erhöht; `draftEdit` ohne If-Match → 412; #12 → 409 `NOT_EDITABLE`; `carol`: `draftEdit` → 409 `DRAFT_ALREADY_EXISTS`, PATCH → 403 `DRAFT_LOCKED_BY_ANOTHER_USER`; `POST /Requests` → 405.

### F-13 Gebundene Aktionen je Schritt, Flags, Dispatcher — erledigt
11 Aktionen gemäß 09 §4.1, `can*`/`isEditable`/`editHidden` im `after READ` auf `[Requests, Requests.drafts]` und im Aktionsergebnis, generischer `on`-Handler mit Draft-Guards, `@restrict`-Grants, `executeStep`/`availableSteps`/`StepOption` entfernt; `status-machine.js` unverändert; Tests umgebaut; 03 §4/§5, 02 E-04.
**AK:** `$metadata` enthält die 11 Aktionen mit `Core.OperationAvailable Path="in/can…"` und `Common.SideEffects`; Flags #1 = `canClarify, canCreateCustomer, canAssignExistingCustomer, canCompleteManually, canReject` true, alle anderen false; `bob` → alle Flags false, Aktion → 403; jeder Schritt aus 01 §6 ist über seine Aktion ausführbar (Jest je Prozessart); Aktion auf Draft → 400 `STEP_NOT_ALLOWED`; Aktion auf aktivem Vorgang mit fremdem Draft → 409 `DRAFT_ALREADY_EXISTS` und alle Flags false; 412 bei veraltetem If-Match (ohne `Preference-Applied`).

### F-14 Strict Handling, Meldungen, Fehlerziele — erledigt
`force = !strict`, 412 + `Preference-Applied: handling=strict` + `details[]` für `CONFIRM_REQUIRED`; `req.notify` (genau eine Erfolgsmeldung) / `req.warn` (Fehlerstatus); `target` für BP-Fehler; `ASSERT_MANDATORY` statt `INPUT_REQUIRED`; `on('error')` für 428/412; 03 §5.1/§5.3.
**AK:** `changeCustomerAssignment` #5 mit BP 1000002 und `Prefer: handling=strict` → 412, Header `preference-applied: handling=strict`, `details[0].@Common.numericSeverity = 3`; ohne `Prefer` → 200 und Status 110; im `$batch` identisch; `rejectRequest` ohne `reason` → 400 `ASSERT_MANDATORY`, `target = reason`; Erfolg → genau eine `sap-messages`-Meldung mit `numericSeverity 1`; CREATE bei „FEHLER“ → 200, Status 150, Warnungen.

### F-15 Labels und semantische Annotationen im Service — erledigt
`srv/monitor-annotations.cds` (`@title` für alle Elemente/Parameter, `Common.Text`, Wertehilfen, Kritikalität, `@cds.search`), `_i18n/i18n.properties` + `_i18n/i18n_de.properties` (Übernahme der `field.*`-Schlüssel), `action.*`/`param.*`/`log.*`; App-Bundle bereinigt; CLAUDE.md-Hinweis Regel 1/4/5/6; 02 E-13.
**AK:** `GET $metadata` mit `Accept-Language: de` zeigt `Common.Label="Debitor"` für `customer`, `Common.Text`, `Common.ValueList`, `UI.UpdateHidden Path="editHidden"`; kein `field.*`-Schlüssel mehr im App-Bundle; Jest prüft zwei Labels in beiden Sprachen.

**Hinweise zur Umsetzung F-11–F-15 (25.10.2026):**
- Backend-Vertrag für Fiori Elements vollständig (09 §4); Jest 75 Tests (57 Service + 18 Statusmaschine), `cds compile srv --to edmx` mit 11 `Core.OperationAvailable`, 114 `Common.Label`.
- Abweichungen zum Plan: Flag-Namen über explizite Zuordnung Schritt → Flag (`rejectRequest` → `canReject`); virtuelle/berechnete Elemente werden beim Aktivierungsprotokoll ignoriert (Draft-Payload enthält die Flags).
- `INPUT_REQUIRED` entfällt für OData-Aufrufe (CAP `ASSERT_MANDATORY` greift vor der Statusmaschine); `INPUT_TOO_LONG` bleibt.
- Die Freestyle-App (`app/monitor`) ist seit F-12/F-13 nicht mehr lauffähig (Draft-Keys, Aktionen) und wird mit F-21 entfernt.

### F-16 FE-App-Gerüst und Liste — erledigt
`app/monitor-fe`: Component (`sap.fe.core.AppComponent`), manifest gemäß 09 §5.2, `annotations.cds` (SelectionFields, SelectionPresentationVariant #Default, LineItem mit FieldGroup-Spalten und Kritikalität), Hinweis-Spalte als Custom Column, i18n; `ui5.yaml` mountPath `/monitor-fe`; 05 §1–§3.
**AK:** App startet unter `/monitor-fe/index.html`; Standardfilter `statusGroup = OPEN,ERROR` vorbelegt, 18 Vorgänge initial geladen; alle 13 Filterfelder wirken (Prozessart/Status/Statusgruppe als Dropdown mit Text); Spalten inkl. Hinweis-Icons und Zeilen-Highlight (Bestellung) wie 04 §2.2; Sortierung `createdAt` aufsteigend; Popin unterhalb Desktop; `npm run lint` grün.

### F-17 Object Page lesend — erledigt
HeaderInfo, HeaderFacets (DataPoints Status/Freigabe, Kennzahlen, Verwaltung), Klärungs-Strip als Custom Header Facet, Facets inkl. Kompositionen, `UI.Hidden` je Prozessart, Protokoll-Tabelle sortiert, FCL-Vollbild/Schließen (FE-Standard).
**AK:** Zeilenklick öffnet Detail in `TwoColumnsMidExpanded`; für CR_WE ist „Ansprechpartner“ ausgeblendet und „Warenempfänger“ sichtbar, sonst umgekehrt; Deep-Link `#/Requests(ID=…,IsActiveEntity=true)` lädt direkt; Protokoll neueste zuerst; Klärungs-Strip nur bei `inClarification`.

### F-18 Schritte als Aktionsgruppe in der UI — erledigt
`UI.Identification` mit `DataFieldForActionGroup #Steps` (11 Aktionen, destruktive zuletzt), i18n-Labels, Bestätigungstext für `reset`, Custom Action „Aktualisieren“ + Controller-Extension.
**AK:** Menü „Schritt ausführen“ zeigt nur Aktionen mit Flag = true aktiv; `rejectRequest` öffnet FE-Parameterdialog (Pflichttext ≤ 100 Zeichen mit Zähler); `changeCustomerAssignment` mit BP 1000002 zeigt Strict-Handling-Rückfrage und wiederholt nach Bestätigen; Fehlerstatus-Schritt zeigt Meldungsdialog; Erfolg zeigt Toast; Status/Protokoll/Kopfdaten aktualisieren sich ohne Reload; Listenzeile zeigt neuen Status.

### F-19 Draft-Bearbeitung in der UI — offen
`onBeforeEdit`-Refresh, `UI.ConnectedFields` (Straße/Hausnummer, PLZ/Ort), `$editState`-Filter ausgeblendet; 04 §4.1.
**AK:** Bearbeiten nur bei `isEditable`; Feldänderungen in Hauptdaten und Ansprechpartner; Sichern erzeugt je Feld einen Logeintrag; Abbrechen mit Rückfrage verwirft; Navigation mit ungesichertem Draft zeigt FE-Datenverlust-Dialog; zweiter Benutzer (`carol`) sieht „gesperrt von alice“; Schritte sind gesperrt, solange ein Draft existiert.

### F-20 OPA-Journeys mit `sap.fe.test` — offen
JourneyRunner, Page Objects (ListReport/ObjectPage), drei Journeys (Liste/Filter; Deep-Link + Bearbeiten + Protokoll; Schritt mit Rückfrage); `test:opa` auf neue Testseite, ggf. Test Starter.
**AK:** `npm run test:opa` grün gegen `start:test`; Journeys decken die AK von F-16–F-19 ab.

### F-21 Cutover — offen
`app/monitor` (Freestyle) löschen, `app/monitor-fe` → `app/monitor`, mountPath `/monitor`, Skripte/README, 04 als FE-Spezifikation, 05, 08; QUnit entfernt; CLAUDE.md-Regeln final.
**AK:** `npm install && cds watch` startet nur noch die FE-App unter `/monitor`; `npm run lint`, `npm test` grün; Docs ohne Verweise auf Freestyle-Artefakte (`availableSteps`, `executeStep`, `FilterBuilder`, `StepService` nur noch historisch in 06).

### F-22 Feinschliff — offen
Spaltenbreiten, Popin-Layout, Tooltips, Leerzustände (FE Illustrated Message), Tastaturbedienung, Deep-Link-Doku, Hinweis zur Draft-Sperre (15 min) in der Benutzerdoku; schließt F-10 ab.
**AK:** Visueller Abgleich mit 04 §2/§3; keine Konsolenfehler.

## Phase 2 – S/4-Anbindung (Vorschau, wird detailliert wenn Phase 1 steht)

- B-01 Entscheidung E-07 (RAP vs. SEGW) und Schnittstellenentwurf S/4 (inkl. Delta-Lesen „geändert seit“, Versionszähler).
- B-02 Refactoring Schrittklassen: Popups → Eingabeparameter (`ZIF_EC_CUSTOMER` erweitern).
- B-03 S/4-Service: Liste, Detail, `change_data` mit Änderungsprotokoll, `get_functions` (→ `can*`-Flags), `execute_function` (← Aktions-Dispatcher, Rückfrage → Strict Handling), Versionszähler für ETag.
- B-04 CAP-Fassade (`cds import` des S/4-Service, Remote-Service-Handler), Destination, Cloud Connector, Principal Propagation.
- B-05 Wertehilfen, Link „Geschäftspartner anzeigen“.
- B-06 Replikation und Delta-Sync (E-14): lokale HANA-Replik von `Requests` + Kindern + Protokoll, Write-through nach `execute_function`/`change_data`, Delta-Pull beim Listenlesen, Versionsabgleich → 412; `draftEdit`/ETag/Flags laufen unverändert auf der Replik. **AK:** Schrittaktion → S/4-Aufruf → lokaler Datensatz aktualisiert; Draft-Aktivierung → `change_data` → lokale Aktualisierung; veraltete Version → 412.

## Phase 3 – Betrieb (Vorschau)

- O-01 `xs-security.json` (Rollen, Attribut SalesOrg), Rollen-Collections.
- O-02 `mta.yaml`, HTML5 Repo, Managed Approuter, Work-Zone-Kachel, SAP HANA Cloud (HDI-Container für Drafts und Replik, E-12/E-14).
- O-03 Logging/Monitoring, Transportweg (CTMS o. ä.).
