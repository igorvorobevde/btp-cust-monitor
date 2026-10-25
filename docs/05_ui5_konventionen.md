# 05 – UI5-Konventionen (Fiori Elements V4, JavaScript)

> Stand 25.10.2026 (F-21, Cutover): Konventionen der **Fiori-Elements-App** `app/monitor` ([09](09_migration_fiori_elements.md)).

## 1. Versionen und Bibliotheken

- **SAPUI5 1.148.12 (LTS)** – festgelegt beim Setup (19.10.2026). Version beim Setup festlegen (gültige LTS laut https://ui5.sap.com/versionoverview.html) und in `manifest.json` (`minUI5Version`) sowie `index.html` fest eintragen.
- Bibliotheken: `sap.fe.templates` (zieht `sap.fe.core`, `sap.fe.macros`, `sap.ui.mdc`, `sap.ui.fl`, `sap.uxap`), `sap.m`, `sap.f`, `sap.ui.core`. Keine `sap.ui.comp`, kein `sap.ui.table`. Andere nur nach Abstimmung.
- Theme `sap_horizon`.
- Code muss UI5-2.0-tauglich sein: keine deprecated APIs (`ui5lint` meldet sie). Eigener Code nur in `ext/` (Fragmente, Controller-Extension) und `test/`.

## 2. Projektstruktur `app/monitor`

```
app/monitor/
├── package.json            # ui5 tooling, linter, test-runner
├── ui5.yaml                # cds-plugin-ui5 mountPath /monitor
├── eslint.config.mjs
├── annotations.cds         # NUR Layout: SelectionFields, SelectionVariant, LineItem, HeaderInfo, Facets, Aktionsgruppe
└── webapp/
    ├── Component.js        # sap.fe.core.AppComponent (8 Zeilen)
    ├── manifest.json       # Routing/FCL, Templates, Tabellen-/Custom-Column-Konfiguration, Extensions
    ├── index.html          # nur lokal; Bootstrap von ui5.sap.com (fixe Version), flexibility-services = SessionStorage
    ├── css/style.css       # Präfix custmon
    ├── changes/flexibility-bundle.json   # leer; verhindert 404 des StaticFileConnector im lokalen Lauf
    ├── i18n/               # NUR App-Texte (Titel, Spalte „Hinweise“, Tooltips, Refresh); Feld-/Aktions-/Abschnittslabels
    │                       # kommen aus $metadata (srv/monitor-annotations.cds + _i18n), FE-Texte aus sap.fe
    ├── ext/
    │   ├── fragment/       # HintsColumn.fragment.xml, ClarificationStrip.fragment.xml (F-17)
    │   └── controller/     # ObjectPageExt.controller.js (F-18)
    └── test/
        ├── debug.html, debugInit.js   # Dev-Hilfe: Konsolenfehler mit Stack, mdc-Property-Duplikate (scripts/fe-console.sh)
        └── integration/    # OPA5 mit sap.fe.test: JourneyRunner, pages/, *Journey.js
```

Vertrags-Semantik (Labels, `Common.Text`, Wertehilfen, Kritikalität, Side Effects, `UI.UpdateHidden`) liegt in `srv/monitor-annotations.cds` (E-13, [03 §8](03_service_vertrag.md)); `app/monitor/annotations.cds` wird von CAP automatisch mitgeladen (`cds.resolve('*')`).

## 3. manifest.json (Kernpunkte)

```json
{
  "sap.app": { "id": "hydac.custmon",
    "dataSources": { "mainService": { "uri": "/odata/v4/monitor/", "type": "OData", "settings": { "odataVersion": "4.0" } } } },
  "sap.ui5": {
    "flexEnabled": true,
    "rootView": { "viewName": "sap.fe.templates.RootContainer.view.Fcl", "type": "XML", "id": "appRootView" },
    "dependencies": { "libs": { "sap.ui.core": {}, "sap.m": {}, "sap.f": {}, "sap.fe.templates": {} } },
    "models": {
      "": { "dataSource": "mainService", "preload": true,
            "settings": { "operationMode": "Server", "autoExpandSelect": true, "earlyRequests": true } },
      "i18n": { "type": "sap.ui.model.resource.ResourceModel",
                "settings": { "bundleName": "hydac.custmon.i18n.i18n", "supportedLocales": ["", "de"], "fallbackLocale": "" } } },
    "routing": {
      "config": { "routerClass": "sap.f.routing.Router", "controlId": "appContent", "controlAggregation": "beginColumnPages",
                  "flexibleColumnLayout": { "defaultTwoColumnLayoutType": "TwoColumnsMidExpanded" } },
      "routes": [ { "name": "RequestsList", "pattern": ":?query:", "target": ["RequestsList"] },
                  { "name": "RequestsObjectPage", "pattern": "Requests({key}):?query:", "target": ["RequestsList", "RequestsObjectPage"] } ],
      "targets": {
        "RequestsList": { "type": "Component", "name": "sap.fe.templates.ListReport", "controlAggregation": "beginColumnPages",
          "options": { "settings": { "contextPath": "/Requests",
            "defaultTemplateAnnotationPath": "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Default",
            "initialLoad": "Enabled", "variantManagement": "None",
            "controlConfiguration": { "@com.sap.vocabularies.UI.v1.LineItem": { "tableSettings": { "type": "ResponsiveTable", "selectionMode": "None" },
              "columns": { "HintsColumn": { "template": "hydac.custmon.ext.fragment.HintsColumn", "properties": ["released", "inClarification", "orderExists"],
                           "position": { "placement": "After", "anchor": "DataField::status_code" } } } } } } } },
        "RequestsObjectPage": { "type": "Component", "name": "sap.fe.templates.ObjectPage", "controlAggregation": "midColumnPages",
          "options": { "settings": { "contextPath": "/Requests", "editableHeaderContent": false, "showRelatedApps": false } } } } } }
}
```

- `supportedLocales` enthält `""` (nicht `"en"`): `i18n.properties` ist der englische Fallback.
- `_version` 2.0.0: kein `async` in `rootView`/`routing.config` (`ui5lint` meldet es als Fehler).
- FCL: `rootView` **muss** `sap.fe.templates.RootContainer.view.Fcl` sein und `routing.config.controlId` = `appContent`, sonst „Control appContent does not have an aggregation called beginColumnPages“.
- Der Filter „Bearbeitungsstatus“ (`$editState`) wird von FE für Draft-Entitäten automatisch ergänzt; er darf **nicht** zusätzlich unter `filterFields` konfiguriert werden (doppelter Property-Key → Seite bleibt busy).
- Deep-Link-Format: `#/Requests(ID=<uuid>,IsActiveEntity=true)`; alte Lesezeichen `#/requests/<uuid>` werden in `Component.js` umgeschrieben (F-17).

## 4. Modelle

| Name | Typ | Zweck |
|---|---|---|
| `""` (default) | OData V4 (von FE verwaltet) | Service-Daten, Drafts, Aktionen |
| `i18n` | ResourceModel (`webapp/i18n`) | App-Texte in Fragmenten/Manifest (`{i18n>…}`) |
| FE-interne Modelle (`ui`, `internal`, `sap.fe.i18n`) | – | nicht direkt verwenden |

Eigene JSON-Modelle gibt es nicht; Zustand (Filter, Bearbeitungsmodus, Layout) hält Fiori Elements.

## 5. OData-V4-Regeln

- Kein manuelles HTTP, kein eigenes `bindContext`/`submitBatch`/`resetChanges` in Extensions: Lesen, Bearbeiten (Draft), Aktionen, Side Effects und Meldungen macht Fiori Elements anhand der Annotationen.
- Extensions greifen über `this.base.getExtensionAPI()` zu (`refresh()`, `getSelectedContexts()`, `invokeAction()` bei Bedarf) und über `override.editFlow.*` auf die Lebenszyklus-Hooks (`onBeforeEdit`, `onBeforeSave`, …).
- ETag/Draft-Sperre/Strict Handling laufen automatisch (03 §3/§5.3/§6); nie `If-Match: *` erzwingen, nie `disableStrictHandling`.
- Nachladen nach Aktionen ausschließlich über `@Common.SideEffects` im Service, nicht per Code.
- Fragmente binden auf den Seitenkontext (z. B. `{inClarification}`); Custom Columns deklarieren ihre benötigten Properties im Manifest (`properties`), damit sie im `$select` landen.
- **Typen in Ausdrücken:** Boolean-Werte in Expression Bindings mit `!!${...}` bzw. `!${...}` auswerten (Fragmente ohne `targetType`).

## 6. Coding-Standards

- Module ausschließlich per `sap.ui.define([...], function (...) { "use strict"; ... })`.
- Controller-Extensions erben von `sap/ui/core/mvc/ControllerExtension`; Overrides im `override`-Block, eigene Handler `onXxx` (im Manifest als `.extension.<voller Name>.onXxx` referenziert).
- Keine globalen IDs, kein `sap.ui.getCore()`; Controls nur über die FE-APIs oder Bindings.
- Keine Inline-Styles; falls nötig `css/style.css` mit Präfix `custmon`.
- Keine Formatter (Kritikalität/Texte kommen aus dem Service). Expression Bindings nur für Sichtbarkeit/Verkettung in Fragmenten.
- Strings: nur i18n (`{i18n>…}` im Fragment/Manifest, `{i18n>…}` in CDS für `_i18n`).
- `async/await` statt Promise-Ketten, Fehler immer behandeln (kein unhandled rejection).
- JSDoc für Extension-Methoden.
- Vor neuem Code prüfen, ob eine Annotation oder Manifest-Einstellung reicht (09 §5); jede Extension begründet sich in docs/04.

## 7. i18n-Schlüssel

| Bundle | Schlüssel | Beispiele |
|---|---|---|
| `_i18n/i18n*.properties` (Service, erscheinen in `$metadata`) | `field.*`, `param.*`, `action.*`, `log.*`, `section.*`, `group.*`, `facet.*`, `column.*`, `menu.*`, `request`/`requests` | `field.customer=Debitor`, `action.rejectRequest=Anfrage ablehnen`, `section.shipTo=Warenempfänger` |
| `_i18n/messages*.properties` (Service, Laufzeitmeldungen) | Fehlercodes, `LOG_*`, `ACTION_DONE*`, `DRAFT_*` | 03 §5 |
| `webapp/i18n/i18n*.properties` (App) | `appTitle`, `appDescription`, `list.col.*`, `list.hint.*`, `detail.*`, `common.*`, FE-Overrides `C_OPERATIONS_ACTION_CONFIRM_MESSAGE\|Requests\|<Aktion>` | `list.hint.orderExists=Bestellung vorhanden` |

Jeder neue Schlüssel in **beiden** Sprachdateien des jeweiligen Bundles. Keine Texte für Status/Schritte/Prozessarten/Freigabe (Codelisten des Service). Hinweis: Properties-Dateien verlieren nachgestellte Leerzeichen – Trennzeichen im Ausdruck anhängen (siehe `ClarificationStrip`).

## 8. Qualität

| Prüfung | Werkzeug | Befehl |
|---|---|---|
| UI5-Lint (deprecated APIs, Manifest, Fragmente) | `@ui5/linter` | `npm run lint:ui5` → `ui5lint` |
| JS-Lint (`ext/`, `test/`) | ESLint (flat config, `eslint:recommended`, Browser-Globals + `QUnit`) | `npm run lint:js` |
| Integration (Journeys gegen den CAP-Mock) | OPA5 mit `sap.fe.test` (`JourneyRunner`, Page Objects `ListReport`/`ObjectPage`) | `npm run test:opa` |
| Service-Tests (Vertrag, Draft, Aktionen, Strict Handling) | `@cap-js/cds-test` + Jest | `npm run test:srv` |
| Alles | `npm test` = `test:srv` + `test:opa` | |

Keine QUnit-Unit-Tests mehr: Es gibt keine Formatter, keinen FilterBuilder und keinen StepService – die Logik liegt im Service (Jest) und in Fiori Elements. Eigener App-Code sind zwei Fragmente und eine Controller-Extension; sie werden über die Journeys abgedeckt.

Journeys (`webapp/test/integration/*Journey.js`, je ein `run()` mit `opaTest`s; `opaTests.qunit.js` registriert sie beim `JourneyRunner` mit `launchParameters: { "sap-ui-language": "en" }`, damit Titel/Labels in den Tests sprachstabil sind):

| Journey | Deckt ab |
|---|---|
| `ListJourney` | Standardfilter (18 offene Vorgänge), Prozessart-Filter (3 × CR_WE) |
| `DetailJourney` | Deep-Link, Abschnitte je Prozessart, Protokoll neueste zuerst, Klärungs-Strip, Umschreiben alter Lesezeichen |
| `StepJourney` | Aktionsmenü nach `can*`-Flags, Parameterdialog, Strict-Handling-Rückfrage, Schritte während eines Drafts gesperrt |
| `EditJourney` | Draft bearbeiten (Hauptdaten + Ansprechpartner) → Sichern → Logeinträge; Draft bleibt bei Navigation erhalten, Verwerfen gibt die Schritte frei |

Regeln für Journeys: Page Objects aus `sap.fe.test` verwenden (`onHeader()`, `onTable({ property })`, `onForm({ section, fieldGroup })`, `onActionDialog()`, `onConfirmationDialog()`), eigene Assertions nur als `CustomPageDefinitions` (z. B. `iDoNotSeeSectionWithTitle`). Abschnitte werden lazy geladen → vor Zugriff auf Tabellen/Felder eines Abschnitts `iGoToSection(...)`. Zeilen in `iPressRow` über einfache Spalten matchen (FieldGroup-Spalten wie „Name“ kennt die Testbibliothek nicht). Jeder Test endet mit `Then.iTeardownMyApp()`.

Tool-Versionen sind in den `package.json` gepinnt (Stand 19.10.2026): `@sap/cds` 9.9.3, `@cap-js/sqlite` 2.4.3, `cds-plugin-ui5` 0.17.4, `@cap-js/cds-test` 1.0.2, `jest` 30.5.2, `@ui5/cli` 4.0.71, `@ui5/linter` 1.23.7, `eslint` 9.39.5 (10.x verlangt Node ≥ 20.19), `ui5-test-runner` 5.14.2.

- `npm run test:opa` startet den Service selbst (`npm run start:test`, Profil `opa`, Port 4004) – vorher laufendes `cds watch` beenden. Berichte und Screenshots: `coverage/opa/`.
- `ui5-test-runner` nutzt das installierte Google Chrome (Headless).
- Die Testseite ist eine klassische QUnit-Seite; `ui5lint` empfiehlt die Migration auf den Test Starter (Warnung, offen).
- `cds.test` und `ui5-test-runner` binden lokale Ports; in einer Sandbox ohne Port-Bindung (z. B. Coding-Assistent) laufen die Tests außerhalb der Sandbox.

## 9. Lokale Entwicklung

- Root: `cds watch` startet Service (Port 4004); `cds-plugin-ui5` served die Apps über UI5-Tooling-Middlewares → FE-App unter `http://localhost:4004/monitor/index.html` (Mount-Pfad in `app/monitor/ui5.yaml`).
- `ui5.yaml` hat bewusst keinen `framework`-Abschnitt: `index.html` und Testseiten laden SAPUI5 (inkl. `sap.fe.*`) vom CDN. `index.html` setzt `xx-component-preload="off"` und `flexibility-services` auf `SessionStorageConnector` (lokal keine Flex-404s; in Work Zone liefert das Launchpad den Flex-Service).
- Mock-Benutzer: `alice` (Editor + Releaser, VKORG 0001/2000/7050), `bob` (Viewer, VKORG 0001), `carol` (Editor, Sperrtests) in `.cdsrc.json` (`[development]`).
- Headless-Prüfung ohne Browserfenster: `scripts/fe-console.sh [pfad#hash] [budget-ms]` startet den Mock (Profil `opa`), lädt die Seite in Headless Chrome und gibt Konsolenfehler, DOM-Kurzfassung und Screenshot aus (`$TMPDIR/fe-console/shot.png`). `test/debug.html` ergänzt JS-Stacks zu Konsolenfehlern und meldet doppelte mdc-Property-Keys (`DUPKEYS`).
- Bekannte, harmlose Konsolenzeile im Standalone-Lauf: „S/CUBE is not yet supported“ (`sap.fe.core` ContextSharingService versucht, sich am SAP-Insights-Kanal zu registrieren; nur mit Launchpad vorhanden).
- Netzwerk-Inspektion: `$batch`-Requests im Browser-Devtools prüfen; ETag im `If-Match`-Header sichtbar; Aktionen senden `Prefer: handling=strict` ([03 §5.3](03_service_vertrag.md)).
