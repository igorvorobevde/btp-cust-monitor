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
List-View gemäß 04 §2 inkl. Default-Filter (ohne 8xx/9xx), Zählung, Sortierung, Hinweis-Icons, Highlight. (Default-Filter und Zählung im Tabellentitel ersetzt durch F-26)
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

### F-10 Feinschliff — erledigt (abgelöst durch F-22)
Leerzustände, Busy-Indikatoren, Tastaturbedienung, Tooltips für Icon-Spalten, Responsiveness (Popin) – mit der Fiori-Elements-App (F-16–F-22) Standardverhalten. ~~Offen geblieben: Test-Starter-Migration der Testseite (ui5lint-Warnung).~~ Erledigt 27.10.2026: Test Starter (`test/testsuite.qunit.*`, `Test.qunit.html`), Inline-Skript der Debug-Seite nach `debugConsole.js`; ui5lint ohne Befunde.

**Hinweise zur Umsetzung F-00–F-09 (19.10.2026):**
- F-01: Abgleich mit SE11-Export der Altstrukturen steht noch aus (Export liegt nicht vor) – Feldlisten = Entwurf aus 03.
- F-01: Vertragsergänzungen ETag auf Kind-Entitäten und rollenabhängiges `isEditable` (siehe 03 §3).
- F-09: Jest 47 Tests (Statusmaschine + Service), QUnit 16, OPA 9 (Liste/Filter, Deep-Link, Bearbeiten inkl. Kind-Feld, 412-Konflikt, REJECT, CONFIRM_REQUIRED + force).

## Phase 1b – Migration auf SAP Fiori Elements (Entscheidung 22.10.2026, siehe [09](09_migration_fiori_elements.md))

Backend-Items zuerst (F-11–F-15, additiv bis auf F-12), FE-App parallel in `app/monitor-fe`, Cutover in F-21. Die Spike-Punkte S1–S14 aus 09 §8 wurden nicht auf einem Wegwerf-Branch, sondern als Prüf-/Rückfallschritte innerhalb von F-16–F-19 auf `main` abgearbeitet (Projektregel: nur `main`). F-10 wird mit F-22 abgeschlossen.

### F-11 Vertrag: Codelisten, berechnete Felder, Wertehilfen — erledigt
`db/schema.cds`: `processTypeRef`, `releaseStateRef`, `statusGroup`, `statusCriticality`, `orderCriticality` (seit F-24 ersetzt durch `rowCriticality`), `releaseCriticality`, `releaseState` (stored), `LogEntries.criticality`, `Statuses.criticality`; Entitäten `StatusGroups`, `ReleaseStates` (+ `_texts` DE/EN); Service: `StatusGroups`, `ReleaseStates`, `SalesOrganizations` (`@restrict where`), `Sources` (`@cds.redirection.target: false`); CSV gemäß 09 §4.5; 03 §2/§3/§8.
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
`app/monitor-fe`: Component (`sap.fe.core.AppComponent`), manifest gemäß 09 §5.2, `annotations.cds` (SelectionFields, SelectionPresentationVariant #Default (ersetzt durch F-26), LineItem mit FieldGroup-Spalten und Kritikalität), Hinweis-Spalte als Custom Column, i18n; `ui5.yaml` mountPath `/monitor-fe`; 05 §1–§3.
**AK:** App startet unter `/monitor-fe/index.html`; Standardfilter `statusGroup = OPEN,ERROR` vorbelegt, 18 Vorgänge initial geladen; alle 13 Filterfelder wirken (Prozessart/Status/Statusgruppe als Dropdown mit Text); Spalten inkl. Hinweis-Icons und Zeilen-Highlight (Bestellung) wie 04 §2.2; Sortierung `createdAt` aufsteigend; Popin unterhalb Desktop; `npm run lint` grün.

### F-17 Object Page lesend — erledigt
HeaderInfo, HeaderFacets (DataPoints Status/Freigabe, Kennzahlen, Verwaltung), Klärungs-Strip als Custom Header Facet, Facets inkl. Kompositionen, `UI.Hidden` je Prozessart, Protokoll-Tabelle sortiert, FCL-Vollbild/Schließen (FE-Standard).
**AK:** Zeilenklick öffnet Detail in `TwoColumnsMidExpanded`; für CR_WE ist „Ansprechpartner“ ausgeblendet und „Warenempfänger“ sichtbar, sonst umgekehrt; Deep-Link `#/Requests(ID=…,IsActiveEntity=true)` lädt direkt; Protokoll neueste zuerst; Klärungs-Strip nur bei `inClarification`.

### F-18 Schritte als Aktionsgruppe in der UI — erledigt
`UI.Identification` mit `DataFieldForActionGroup #Steps` (11 Aktionen, destruktive zuletzt), i18n-Labels, Bestätigungstext für `reset`, Custom Action „Aktualisieren“ + Controller-Extension.
**AK:** Menü „Schritt ausführen“ zeigt nur Aktionen mit Flag = true aktiv; `rejectRequest` öffnet FE-Parameterdialog (Pflichttext ≤ 100 Zeichen mit Zähler); `changeCustomerAssignment` mit BP 1000002 zeigt Strict-Handling-Rückfrage und wiederholt nach Bestätigen; Fehlerstatus-Schritt zeigt Meldungsdialog; Erfolg zeigt Toast; Status/Protokoll/Kopfdaten aktualisieren sich ohne Reload; Listenzeile zeigt neuen Status.

### F-19 Draft-Bearbeitung in der UI — erledigt
`onBeforeEdit`-Refresh (Bearbeiten startet mit frischen Daten); Bearbeiten/Sichern/Abbrechen sind FE-Standard (Draft). Bewusst nicht umgesetzt (Umsetzungsnotizen unten): `UI.ConnectedFields` (einzelne Formularzeilen genügen), Ausblenden des FE-Filters „Bearbeitungsstatus“ (Konfiguration erzeugt doppelten Property-Key), Datenverlust-Dialog beim Zeilenwechsel (FE speichert jede Änderung sofort im Entwurf). 04 §4.1.
**AK:** Bearbeiten nur bei `isEditable`; Feldänderungen in Hauptdaten und Ansprechpartner; Sichern erzeugt je Feld einen Logeintrag; Abbrechen mit Rückfrage verwirft; Zeilenwechsel während der Bearbeitung behält den Entwurf, der beim nächsten Öffnen fortgesetzt wird; zweiter Benutzer (`carol`) sieht „gesperrt von alice“ (Jest); Schritte sind gesperrt, solange die Draft-Sperre gilt.

### F-20 OPA-Journeys mit `sap.fe.test` — erledigt
JourneyRunner, Page Objects (ListReport/ObjectPage), vier Journeys (Liste/Filter; Detail; Schritte; Bearbeiten); `test:opa` auf neue Testseite.
**AK:** `npm run test:opa` grün gegen `start:test` (frischer Server, die Journeys verändern die Mock-Daten). OPA deckt ab: Standardfilter und Prozessart-Filter, Deep-Link, Abschnitte je Prozessart, Protokollreihenfolge, Klärungs-Strip, Lesezeichen-Umschreibung, Aktionsmenü nach Flags, Parameterdialog mit Pflichtfeld, eigener Bestätigungstext, Strict-Handling-Rückfrage (Bestätigen und Abbrechen), Schritte während Draft gesperrt, Draft bearbeiten/sichern/fortsetzen/verwerfen. Jest (Service) deckt ab: alle 13 Filterfelder (`$filter`/`$search`), Fehlerstatus-Warnungen, Erfolgsmeldung, ETag-412, Sperre durch zweiten Benutzer, Aktivierungsprotokoll. Nicht automatisiert (Sichtprüfung 09 §8): Hinweis-Icons, Listenzeilen-Refresh nach Schritt im FCL, Toast.

### F-21 Cutover — erledigt
`app/monitor` (Freestyle) löschen, `app/monitor-fe` → `app/monitor`, mountPath `/monitor`, Skripte/README, 04 als FE-Spezifikation, 05, 08; QUnit entfernt; CLAUDE.md-Regeln final.
**AK:** `npm install && cds watch` startet nur noch die FE-App unter `/monitor`; `npm run lint`, `npm test` grün; Docs ohne Verweise auf Freestyle-Artefakte (`availableSteps`, `executeStep`, `FilterBuilder`, `StepService` nur noch historisch in 06).

### F-22 Feinschliff — erledigt
Spaltenbreiten, Popin-Layout, Tooltips, Leerzustände (FE Illustrated Message), Tastaturbedienung, Deep-Link-Doku, Hinweis zur Draft-Sperre (15 min) in der Benutzerdoku; schließt F-10 ab.
**AK:** Visueller Abgleich mit 04 §2/§3; keine Konsolenfehler.

### F-23 Sichtbarkeit von Kind-Entitäten und Protokoll — erledigt
Befund Review 25.10.2026 (bestand schon vor der Migration): Der VKORG-/Freigabe-Filter wirkt nur auf `Requests`; `bob` kann `Requests(#2)/log`, `/salesData`, `/LogEntries` und alle `ContactPersons` auch zu nicht sichtbaren Vorgängen lesen (07 R-08). Sichtbarkeitsfilter auf `SalesData`, `ContactPersons`, `ShipToParties`, `LogEntries` (über `request`) ergänzen, inkl. `$expand` von `LogEntries` auf `request`.
**AK:** `GET /Requests(#2)/log`, `/salesData`, `/ContactPersons` als `bob` → 404 bzw. leer; Jest-Tests je Entität; alice unverändert.
**Umsetzung:** `before READ` auf `SalesData`, `ContactPersons`, `ShipToParties`, `LogEntries` hängt die VKORG-/Freigabe-Bedingung der Vorgänge über den Pfad `request.*` an (eine Quelle: `visibilityWhere`); Jest „F-23 …“ je Entität, Navigation von #2 und `LogEntries?$expand=request`; 03 §3.

**Nachtrag Review Backend (25.10.2026):** Aktivierung schreibt nur editierbare Felder (read-only/berechnete Werte aus der Draft-Kopie werden verworfen); Schrittaktionen schreiben bedingt (`modifiedAt` unverändert, sonst 412) – die ETag-Prüfung der Schrittaktionen liegt allein im Service (CAP prüft bei Draft-Entitäten nur Aktionen auf dem Entwurf). Offen (gering): ~~`draftEdit` akzeptiert `If-Match: *`~~ (erledigt 26.10.2026, 412); ~~Prozessart-Regel für Kind-Änderungen ohne Testdaten~~ (erledigt 26.10.2026: Service-Tests per deep UPDATE; dabei behoben, dass ein neu angelegtes Kind die Regel umging); ~~`statusGroup` ohne `Common.Text`~~ (erledigt 26.10.2026: `status/groupRef/text`); ~~Hinweis bei abgelaufener Draft-Sperre~~ (erledigt 26.10.2026: Warnung `DRAFT_CHANGED_MEANWHILE` beim Sichern, wenn ein Schritt den Vorgang inzwischen geändert hat); ~~`ProcessSteps`-Cache vor Phase 2~~ (erledigt 26.10.2026: Customizing-Cache für `ProcessSteps`, `ApprovalRules`, `Steps` je Sprache).

### F-24 Arbeitsvorrat im Service: Wartezeit, Empfehlung, Priorität — erledigt
`waitingSince` (gesetzt bei jeder Zustandsänderung Status/Klärung/Freigabe, Testdaten = `modifiedAt`), virtuelles `waitingText` (relativer Text aus `messages*.properties`, Sprache aus `Accept-Language`), `nextStep`/`nextStepText` (Empfehlung aus der Statusmaschine, Prioritätsliste RELEASE → CREATE → CREATE_WE → AP_MODIFY → CHNG_OLD → CNG_DEBI → CNG_NEW; nie REJECT/MANUAL_OK/CLARIFY/RESET; keine Empfehlung ohne erlaubten Schritt), berechnete `priority` und `rowCriticality` (ersetzt `orderCriticality`), Sortier-/Filterrestriktionen, Side Effects; 03 §2/§4.1/§5.1/§8.
**AK:** `GET Requests(#1)` liefert `waitingSince = 2026-10-01T08:15Z`, `waitingText` „n Tage“/„n days“ je Sprache, `nextStep = CREATE` (alice); #6: `nextStep` leer für bob (Betrachter); #2: `RELEASE` für alice, für carol unsichtbar (404); `release` setzt `waitingSince` neu, fehlgeschlagener Schritt und Draft-Aktivierung nicht; `$orderby=priority asc,waitingSince asc` liefert Fehler zuerst (#3 an Position 1); `$filter` auf `waitingText` wird abgelehnt, `$metadata` trägt `NonSortableProperties`/`NonFilterableProperties`; Jest grün.

### F-25 Freigabegrund sichtbar — erledigt
`releaseReason` + `releaseLimit` aus der Freigabeprüfung (01 §4): ALWAYS, NO_RULE, NOT_REQUIRED, CREDIT_CARD, UNDER_LIMIT, OVER_LIMIT, NO_VOLUME, MANUAL_REQUIRED, MANUAL (manuelle Freigabe); Codeliste `ReleaseReasons` (DE/EN), `releaseReasonRef`, `Common.Text`, Wertehilfe; CNG_NEW schreibt Grund und Limit neu; Side Effects; Spalte „Freigabegrund“ nach „Hinweise“, Felder in Zuordnung → Freigabe; Testdaten je Zeile; 03 §2/§3/§5.2/§7/§8, 04 §2.2/§3.3.
**AK:** #2 → `MANUAL_REQUIRED` (nicht freigegeben, kein Limit), #3 → `CREDIT_CARD` mit Limit 5.000, #11 → `UNDER_LIMIT`, #15 → `MANUAL`; `release` auf #2 → `MANUAL`; `convertToNewCustomer` auf #5 → `NO_VOLUME`, auf #26 → `UNDER_LIMIT` freigegeben; `$expand=releaseReasonRef` liefert DE/EN-Texte; Object Page zeigt Freigabegrund und Freigabelimit (Währung des Vorgangs); Listenspalte in allen Sichten; Jest grün.

### F-26 Arbeitsvorrat in der Liste: Sichten, Spalten, Sortierung, Kopf-Datenpunkt — erledigt
Fünf Sichten als Registerkarten mit Zählern (`views`, `showCounts`, je Registerkarte eine Tabelle mit demselben `UI.LineItem`): Meine Arbeit (offen + Fehler), Fehler, Klärung (in Klärung und offen/fehlerhaft), Freigabe (nicht freigegeben, offen), Alle; kein Standardwert mehr für Statusgruppe; nach einem Schritt auf der Object Page lädt die Liste neu (`editFlow.onAfterActionExecution` → `ExtensionAPI.refresh()`, D-14, einzige weitere Erweiterungslogik, 05 §6); Spalten „Nächster Schritt“ und „Wartet seit“; damit alles bei 1.500 px passt, sind Magento-Company, Bestellvolumen, Erstellt und Geändert jetzt `UI.Importance #Low` (Popin); Standardsortierung `priority`, `waitingSince` (`UI.PresentationVariant`); Zeilen-Highlight `rowCriticality`; Object Page: DataPoint „Nächster Schritt“; 15 OPA-Tests (Registerkartentabellen über `onTable("<key>")`); 04 §2/§3.1.
**AK:** Start zeigt Sicht „Meine Arbeit (18)“, erste Zeile ein Fehlervorgang (#3), Zähler je Sicht (Fehler 4, Klärung 2, Freigabe 4, Alle 26); Sichtwechsel filtert ohne Start, Filterleiste wirkt zusätzlich (UND); Spalten sichtbar und sortierbar nach Zeitpunkt/Priorität über die Tabelleneinstellungen; Detailkopf zeigt „Nächster Schritt“ und aktualisiert ihn nach jedem Schritt; keine Konsolenfehler; `npm run lint`, `npm test` grün. Nicht umgesetzt (09 §8.1): Hervorhebung des empfohlenen Eintrags im Schrittmenü – FE 1.148 rendert `Criticality` nur auf Einzelbuttons, nicht auf Menüeinträgen.

## Phase 2 – Persistenz in HANA und Anbindung über Standard-APIs (E-15)

Stand 06.11.2026: Phase 1 und Betrieb (O-01–O-03) sind fertig. Mit E-15 ([02](02_architektur.md) §3) entfallen der eigene S/4-Service, das Refactoring der Schrittklassen und die Replik: **BTP ist das führende System für die Vorgänge, S/4 wird nur über `API_BUSINESS_PARTNER` angesprochen.** Die Schrittlogik des Mocks (B-04-Vorarbeit) wird die Produktivlogik. Ohne S/4-System und BTP-Subaccount bereits umgesetzt: Wertehilfe Geschäftspartner (B-05), Backend-Schnittstelle `srv/backend/` (B-04). Entwurf der Schnittstellen: [10](10_s4_schnittstelle.md); Reihenfolge der nächsten Schritte: [10](10_s4_schnittstelle.md) §9.

- B-01 **Magento-Eingang** (`IntakeService`, E-16): drei Operationen in heutiger Payload-Struktur, Vorgang + Original/Arbeitskopie anlegen, Prozessart bestimmen, Freigabeprüfung, Protokolleinträge „Eingang“ und Freigabeergebnis, `backendSystem` aus dem Service Key, Idempotenz auf Magento-IDs, OAuth 2.0 Client Credentials (eigener Scope). Vertrag mit TechDivision abstimmen ([10](10_s4_schnittstelle.md) §2). **AK:** Eingang per HTTP erzeugt denselben Vorgang wie die CSV-Testdaten (Status, Freigabe, Protokoll); Wiederholung erzeugt keinen zweiten Vorgang; ohne gültigen Client 401.
- B-02 **Schrittlogik produktiv:** `srv/backend/mock.js` wird zur Produktivimplementierung (Umbenennung, kein Verhaltenswechsel); CREATE / CREATE_WE / AP_MODIFY rufen den S/4-Adapter (B-03), erzeugte Nummern werden sofort persistiert, Teilschritte sind wiederholbar (R-11), Schritte je Vorgang serialisiert (ETag + Zeilensperre, R-01). **AK:** bestehende Service-Tests grün; CREATE gegen `cds mock API_BUSINESS_PARTNER` legt BP, Debitor und Ansprechpartner an und schreibt die Nummern; Abbruch nach BP-Anlage → Wiederholung legt keinen zweiten BP an.
- B-03 **S/4-Adapter Geschäftspartner-API** (`srv/backend/s4-bp.js`): `cds import API_BUSINESS_PARTNER.edmx` (kind `odata-v2`), Destination je Backend aus der Registry, Abbildung Schritt → Entity Sets ([10](10_s4_schnittstelle.md) §3.1), Fehlerabbildung (`BP_NOT_FOUND`, `BP_NOT_CUSTOMER`, `BACKEND_UNAVAILABLE`, API-Meldungen ins Protokoll), Mock-Daten in `srv/external/data` für `cds watch`. **AK:** Adapter-Tests gegen den Mock; Wertehilfe und CHNG_OLD/CNG_DEBI lesen über den Adapter.
- B-04 Destination, Cloud Connector, Principal Propagation gegen Q4H/GWQ. — Vorarbeit erledigt 27.10.2026: Backend-Schnittstelle `srv/backend/` (Mock-Adapter, Auswahl per `cds.requires.backend.kind`, 09 §7, `test/backend.test.js`). Offen (braucht Subaccount): Destination `S4_EU` (OnPremise, PrincipalPropagation), Cloud-Connector-Pfad `/sap/opu/odata/sap/API_BUSINESS_PARTNER/`, Zertifikatsregel in S/4; DEV-Start mit technischem Benutzer. **AK:** `GET A_BusinessPartner` über die Destination als angemeldeter Benutzer liefert Daten; Änderungsbeleg in S/4 zeigt den echten Benutzer.
- B-05 Wertehilfen, Link „Geschäftspartner anzeigen“. — Wertehilfe erledigt 27.10.2026 (`BusinessPartners` aus den Mock-BPs, Parameter von CHNG_OLD/CNG_DEBI; 03 §8, 04 §3). Offen: Quelle auf den Adapter (B-03) umstellen, Magento-Company aus der lokalen Zuordnung; Link „Geschäftspartner anzeigen“ (S/4-App „Geschäftspartner verwalten“ in der Work Zone, Intent über `Common.SemanticObject`).
- B-06 **Persistenz in HANA als führendes System** (E-15/E-18): Customizing-Entitäten (`ProcessSteps`, `ApprovalRules`, `Steps`, Statustexte) um `backendSystem` erweitern, Initialbestand aus `db/data`, Cache mit Invalidierung; Pflege-App (Fiori-Elements-Liste, Rolle `MonitorAdmin`); Zuordnungstabelle `MagentoAssignments`; Feld `backendSystem` + Codeliste am Vorgang (Filter/Spalte „Region“, 03/04 anpassen); Testvorgänge aus dem Produktiv-Deployment entfernen; `@PersonalData`-Annotationen und Audit Logging (E-19). **AK:** Customizing-Änderung in der Pflege-App wirkt ohne Neustart; Vorgang trägt `backendSystem`; Liste filtert danach; `npm test` grün.
- B-07 **Notifications an Magento** (E-17): persistente Outbox (`cds.queued`), HTTP-Destination je Shop, Payloads wie heute (ID-Notification, `RejectCusomterSet`, R-05 adressgenau nach Abstimmung), Ergebnis als Protokolleintrag, Aktion „Notification erneut senden“ (R-04). **AK:** Schritt mit Rollback sendet nichts; erfolgreicher Schritt sendet genau einmal nach Commit; nicht erreichbarer Shop → Wiederholung, Protokoll zeigt Fehler und späteren Erfolg.
- B-08 **Cutover:** Export der offenen Vorgänge (`ZEC_CUSTOMER` + Payload + Protokoll) und der Magento-Zuordnungen aus S/4 (CSV/OData), Import nach HANA, Umschaltung der Magento-Endpunkte je Shop mit TechDivision, Parallelbetrieb, Stilllegung der Z-Services ([10](10_s4_schnittstelle.md) §8). **AK:** übernommene Vorgänge sind im Monitor mit Status, Freigabe und Protokoll sichtbar; ein nach der Umschaltung aus Magento gesendeter Eingang landet in HANA, nicht mehr in S/4.

## Phase 3 – Betrieb (Vorschau)

- O-01 `xs-security.json` (Rollen, Attribut SalesOrg), Rollen-Collections. — erledigt 27.10.2026 (02 §5, `test/xs-security.test.js`); offen bis zum ersten Deployment: ob BTP für Templates mit Attribut Default-Rollen für die Role Collections anlegt, sonst legt der Admin sie im Cockpit an.
- O-02 `mta.yaml`, HTML5 Repo, Managed Approuter, Work-Zone-Kachel, SAP HANA Cloud (HDI-Container für Drafts und Vorgänge, E-12/E-15). — erledigt 27.10.2026 bis zum MTA-Archiv (02 §7): `cds build --production`, `npm run build` (app) und `mbt build` laufen lokal durch; ein Deployment (`cf deploy`) braucht Subaccount, HANA-Cloud-Instanz und Work Zone und ist noch nicht erfolgt.
- O-03 Logging/Monitoring, Transportweg (CTMS o. ä.). — erledigt 27.10.2026 (02 §8): HTTP-Health-Check auf `/health`, SAP-Cloud-Logging-Bindung optional per `mta-cloud-logging.mtaext`, Transport als ein Archiv durch DEV → QAS → PRD (CTMS empfohlen); Einrichtung von CTMS/Cloud Logging im Subaccount steht mit dem ersten Deployment aus.
