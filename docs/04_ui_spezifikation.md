# 04 – UI-Spezifikation (Fiori Elements für OData V4)

Stand 25.10.2026 (F-21, Cutover). Die UI ist eine **Fiori-Elements-App** (`sap.fe.templates`, List Report + Object Page im FlexibleColumnLayout). Die Spezifikation ist deshalb weitgehend die Menge der Annotationen: Vertrags-Semantik in `srv/monitor-annotations.cds` ([03 §8](03_service_vertrag.md)), Layout in `app/monitor/annotations.cds`, Konfiguration in `app/monitor/webapp/manifest.json` ([05 §3](05_ui5_konventionen.md)). Eigener Code: zwei Fragmente, eine Controller-Extension ([09 §5](09_migration_fiori_elements.md)).

Zielgruppe: Sachbearbeiter im Backoffice, Desktop first (≥ 1280 px), Tablet nutzbar, Theme `sap_horizon`. Sprachen EN (Fallback) und DE.

## 1. Layout und Navigation

FlexibleColumnLayout (FE-Root-View `sap.fe.templates.RootContainer.view.Fcl`), Standard `TwoColumnsMidExpanded`.

| Route | Pattern | Inhalt |
|---|---|---|
| `RequestsList` | `:?query:` | Filterleiste + Liste (Begin Column) |
| `RequestsObjectPage` | `Requests({key}):?query:` | Liste + Detail (Mid Column); Vollbild und Schließen über die FE-Standardaktionen; Layout steht in `?layout=` |

- Deep-Link: `#/Requests(ID=<uuid>,IsActiveEntity=true)` (Lesezeichen, Mail-Link). Alte Freestyle-Links `#/requests/<uuid>[/full]` werden in `Component.js` umgeschrieben.
- Unbekannter oder nicht sichtbarer Vorgang → FE-Hinweisseite „Sorry, we can't find this page“ (404 vom Service).
- Navigation während der Bearbeitung: Jede Änderung wird sofort im Entwurf gespeichert (Draft); ein Zeilenwechsel verliert nichts, der Entwurf bleibt erhalten und wird beim nächsten Öffnen fortgesetzt (§4.1).

## 2. Liste (List Report)

`UI.SelectionFields`, `UI.SelectionPresentationVariant#Default`, `UI.LineItem` in `app/monitor/annotations.cds`; Wertehilfen und Texte aus dem Service.

### 2.1 Filterleiste

Filter wirken mit **Start** (Go); „Filter anpassen“ erlaubt weitere Felder (Adaptation). Keine Varianten (`variantManagement: None`).

| Filter | Steuerelement (FE) | Standard | Quelle |
|---|---|---|---|
| Suche | Suchfeld (`$search` über name, name2, magentoCompany) | – | `@cds.search` |
| Bearbeitungsstatus | FE-Standardfilter für Draft-Entitäten (Alle / eigene Entwürfe …) | Alle | FE |
| Statusgruppe | Multi-Combo (feste Werte) | **OPEN + ERROR** (= offene Vorgänge, ersetzt die alten Haken „Erledigte/Abgelehnte einbeziehen“) | `statusGroup`, Wertehilfe `StatusGroups` |
| Freigegeben | Boolean-Auswahl | – | `released` |
| In Klärung | Boolean-Auswahl | – | `inClarification` |
| Debitor | Eingabe | – | `customer` |
| Verkaufsorganisation | Wertehilfe (Distinct) | – | `SalesOrganizations` (nur erlaubte VKORG) |
| Prozessart | Multi-Combo mit Text | – | `ProcessTypes` |
| Status | Multi-Combo mit Text | – | `Statuses` |
| Quelle | Wertehilfe (Distinct) | – | `Sources` |
| Bestellung vorhanden | Boolean-Auswahl | – | `orderExists` |
| Erstellt am / Geändert am | Datums-/Zeitraumfilter | – | `createdAt` / `modifiedAt` |
| Erstellt von / Geändert von | Eingabe | – | `createdBy` / `modifiedBy` |

Der Filterzustand bleibt beim Wechsel Liste ↔ Detail erhalten (FE-App-State).

### 2.2 Tabelle

Responsive Tabelle, keine Zeilenselektion, Zeilenklick öffnet das Detail; Titel „Vorgänge (n)“ (`HeaderInfo.TypeNamePlural` + `$count`); Standardsortierung `createdAt` aufsteigend (`PresentationVariant#Default`); Sortierung und Spaltenauswahl über die Tabelleneinstellungen (Personalisierung Spalten/Sortierung).

| Spalte | Inhalt | Popin (< Desktop) |
|---|---|---|
| Status | Statustext mit Kritikalität und Icon (`status_code` + `Common.Text`, `statusCriticality`) | nein (High) |
| Hinweise | Custom Column `ext/fragment/HintsColumn.fragment.xml`: Schloss (nicht freigegeben), ? (in Klärung), Wagen (Bestellung) | nein (High) |
| Freigabegrund | Text des Freigabegrunds (`releaseReason` + `Common.Text` aus `ReleaseReasons`, F-25), z. B. „Manuelle Freigabe vorgeschrieben (Customizing)“ | ja |
| Prozessart | Text (`processType` + `Common.Text`) | ja |
| Name | Name 1 / Name 2 untereinander (`FieldGroup#Name`) | nein (High) |
| Debitor | `customer` | ja |
| VKORG | `salesOrganization` | ja |
| Magento-Company | `magentoCompany` | ja |
| Bestellvolumen | `orderVolume` mit Währung | ja |
| Erstellt | `createdAt` / `createdBy` (`FieldGroup#Created`) | ja |
| Geändert | `modifiedAt` / `modifiedBy` (`FieldGroup#Changed`) | ja |

Fehlerzeilen rot, Zeilen mit Bestellung blau (`UI.LineItem.@UI.Criticality: rowCriticality`). Leerzustand: FE-Standard („Keine Daten …“). Spaltenbreiten sind im Manifest festgelegt (`controlConfiguration … columns … width`, Summe ≈ 102,5 rem ≈ 1.640 px inkl. Freigabegrund 11 rem); ist die Tabelle schmaler, wandern Medium-Spalten (zuerst Erstellt/Geändert) automatisch in den Popin; in der Zwei-Spalten-Ansicht wandern Medium-Spalten in den Popin, den die Tabellen-Schaltfläche „Details anzeigen“ ein-/ausblendet.

## 3. Detail (Object Page)

### 3.1 Kopf

- Titel `name`, Untertitel Prozessart (Text), FE-Draft-Indikator.
- Custom Header Facet `ClarificationStrip`: Warn-Strip „In Klärung: {clarificationComment}“, nur bei `inClarification`.
- Kopf-Facetten: DataPoint **Status** (`status_code`, `statusCriticality`), DataPoint **Freigabe** (`releaseState` mit Text aus `ReleaseStates`, grün freigegeben / orange nicht freigegeben), **Kennzahlen** (Debitor, Geschäftspartner, VKORG, Bestellung vorhanden, Bestellvolumen), **Verwaltungsdaten** (erstellt/geändert von/am).

### 3.2 Kopfaktionen

| Aktion | Sichtbar / aktiv | Umsetzung |
|---|---|---|
| Bearbeiten (FE) | nur wenn `editHidden = false` (= `isEditable`: Status offen, freigegeben, Rolle MonitorEditor) | `@UI.UpdateHidden: editHidden`, Draft (§4.1) |
| Schritt ausführen (Menü) | immer; Einträge aktiv je `can*`-Flag; alle inaktiv, solange ein Entwurf existiert | `UI.DataFieldForActionGroup #Steps` mit 11 Aktionen, destruktive (Ablehnen, Erneut bearbeiten) zuletzt |
| Aktualisieren | immer | Custom Action → `ObjectPageExt.onRefresh` (`ExtensionAPI.refresh`) |
| Vollbild / Schließen | FE-Standard (FCL) | |

### 3.3 Abschnitte

Anzeige über `UI.Facets`; Felder als `UI.FieldGroup`s, Kind-Entitäten über die 1:1-Navigation (`admin/@UI.FieldGroup#Admin` usw.). Bearbeitbar sind alle Felder, die im Service nicht `@readonly` sind; Pflichtfelder/Längen aus den Metadaten, fachliche Prüfung im Backend.

| Abschnitt | Sichtbar | Felder (ro = nie editierbar) |
|---|---|---|
| Hauptdaten (Gruppen Name, Adresse, Kommunikation, Steuerdaten) | immer | Anrede, Name 1–4; Straße, Hausnummer, Straße 4/5, PLZ, Ort, Land; Sprache, Telefon, E-Mail; USt-IdNr., Steuernummer 2, Suchbegriff 2, Branche, DUNS – alle editierbar |
| Ansprechpartner (`admin`) | `processType ≠ CR_WE` (`UI.Hidden`-Ausdruck) | ro: AP-Nummer, GP, Magento-Customer; editierbar: Webshop-Rolle, Anrede, Vorname, Nachname, Funktion, Abteilung, Sprache, Telefon, E-Mail |
| Vertriebsdaten (`salesData`) | immer | ro: VKORG; editierbar: Vertriebsweg, Sparte, Verkäufergruppe, Verkaufsbüro, Kundengruppe, Verkaufsbezirk, Incoterms 1/2 |
| Warenempfänger (`shipTo`) | `processType = CR_WE` | ro: WE-Nummer, GP, Magento-Address, Adresse in Auftrag verwendet; editierbar: Name 1–4, Straße, Hausnummer, Straße 4/5, PLZ, Ort, Land, USt-IdNr. |
| Zuordnung (Gruppen SAP-Nummern, Magento, Freigabe) | immer | alle ro: Debitor, GP, Warenempfänger, AP-Nummer; Magento-Company/-Customer/-Address, Quelle; Freigabeverfahren, Freigabegrund (Text aus `ReleaseReasons`), Freigabelimit (mit Währung, leer ohne Limit), freigegeben von/am |
| Protokoll (`log`) | immer | Tabelle: Typ (Icon mit Kritikalität), Zeitpunkt, Benutzer, Schritt, Meldung, Feld, alter/neuer Wert; neueste zuerst (`PresentationVariant#Log`) |

Abschnitte werden von FE lazy geladen (beim Scrollen bzw. Anklicken des Reiters).

## 4. Abläufe

### 4.1 Bearbeiten (Draft)

1. **Bearbeiten** → `draftEdit` (vorher lädt die Extension den Vorgang neu, damit kein veralteter ETag auftritt). Nicht bearbeitbare Vorgänge (abgeschlossen, nicht freigegeben, Viewer) zeigen die Aktion nicht; ein Entwurf eines anderen Benutzers → Hinweis „gesperrt von …“ (409 `DRAFT_ALREADY_EXISTS`).
2. Jede Feldänderung wird sofort im Entwurf gespeichert (PATCH auf dem Draft, auch für Ansprechpartner/Vertrieb/Warenempfänger).
3. **Sichern** → `draftActivate`: Vorgang wird aktualisiert, je geändertem Feld ein Protokolleintrag, Entwurf gelöscht, Toast „Gesichert“ (FE). Fachliche Fehler bleiben im Bearbeitungsmodus (Meldungen im Fußbereich).
4. **Abbrechen** → Entwurf verwerfen (Rückfrage, wenn Änderungen vorliegen).
5. Solange die Draft-Sperre gilt (15 min seit der letzten Änderung, bei jeder Änderung verlängert), sind alle Schritte gesperrt (Menüeinträge inaktiv, Flags `false`) und andere Benutzer können nicht bearbeiten. Nach Ablauf der Sperre sind Schritte wieder möglich, auch wenn der Entwurf noch existiert (z. B. nach einem Zeilenwechsel ohne Sichern, §1); der Besitzer kann den Entwurf weiterhin öffnen und sichern oder verwerfen – gesichert werden dann nur die editierbaren Felder. Ein anderer Bearbeiter kann einen abgelaufenen Entwurf über **Bearbeiten** übernehmen (FE-Rückfrage) und verwerfen.

### 4.2 Schritt ausführen

1. Menü **Schritt ausführen** → aktive Einträge nach `can*`-Flags des Backends (die UI rechnet nichts).
2. Parameterlose Schritte (Freigeben, Erneut bearbeiten, Anlegen …) → FE-Bestätigungsdialog (`Common.IsActionCritical`, Texte `C_OPERATIONS_ACTION_CONFIRM_MESSAGE|Requests|<Aktion>` im App-Bundle, das im Manifest-Target der Object Page als `enhanceI18n` eingetragen ist).
3. Anfrage ablehnen / In Klärung → FE-Parameterdialog mit Pflichttext (max. 100 Zeichen, `@mandatory`, `@UI.MultiLineText`). Debitor zuordnen → Parameterdialog Geschäftspartner (Pflicht, 1–10 Ziffern; Phase 2: Wertehilfe).
4. Rückfrage des Backends (z. B. Debitor gehört anderer Magento-Company): Strict Handling – 412 mit Frage → FE-Bestätigungsdialog → Wiederholung ohne `Prefer`-Header ([03 §5.3](03_service_vertrag.md)).
5. Ergebnis: Side Effects laden Status, Flags, Zuordnung, Protokoll und Kinder neu; die Listenzeile aktualisiert sich. Erfolg → Toast „{Schritt}: neuer Status „{Status}““; Fehlerstatus (140/150/160) → Meldungsdialog mit Warnungen; Abbruch (422 `STEP_ABORTED`) → Fehlerdialog, Eintrag im Protokoll.
6. ETag-Konflikt (412 ohne `Preference-Applied`) → Fehlerdialog „zwischenzeitlich geändert“, danach **Aktualisieren**.

### 4.3 Meldungen

FE-Standard: Meldungen aus `sap-messages` und Fehlerantworten erscheinen als Toast (eine Erfolgsmeldung), Dialog (Warnungen/Fehler, Rückfragen) oder im Meldungs-Button des Fußbereichs (gebundene Meldungen beim Bearbeiten). Technische Fehler (Service nicht erreichbar, 5xx) → FE-Fehlerdialog, kein Absturz.

## 5. Status-Darstellung

Kein Formatter: Farben und Icons kommen aus `statusCriticality` / `Statuses.criticality` (5 Information = OPEN, 1 Fehler = ERROR, 0 neutral = REJECTED, 3 Erfolg = DONE), Freigabe aus `releaseCriticality` (3 freigegeben, 2 nicht), Protokoll aus `LogEntries.criticality` ([03 §8](03_service_vertrag.md)). Hinweis-Icons: `locked` (nicht freigegeben), `question-mark` (in Klärung), `cart` (Bestellung vorhanden).

## 6. Texte und Sprachen

- Feld-, Aktions-, Abschnitts- und Spaltenbezeichner: `_i18n/i18n.properties` (EN) / `_i18n/i18n_de.properties` über `$metadata` (`Common.Label`).
- Status-, Prozessart-, Schritt- und Freigabetexte: Codelisten des Service (`Accept-Language`).
- App-Bundle (`webapp/i18n`): App-Titel, Spalte „Hinweise“ und Tooltips, Klärungs-Strip, Aktualisieren, Bestätigungstexte der Schritte.
- Alle übrigen Texte (Bearbeiten, Sichern, Dialoge, Filterleiste …): `sap.fe` (EN/DE und weitere).

## 7. Nicht im Umfang Phase 1

Anzeige des GP in S/4, Wertehilfen für Land/Sprache/GP/Vertriebsdaten (Phase 2, B-05), Delta-Ansicht des Original-Payloads, Excel-Export, Varianten (Variantenmanagement bewusst aus), Key-User-Adaption (Phase 3 mit Work Zone).
