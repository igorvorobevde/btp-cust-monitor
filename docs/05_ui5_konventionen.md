# 05 – UI5-Konventionen (Fiori Elements V4, JavaScript)

> Stand 25.10.2026: §1–§3 und §9 beschreiben die **Fiori-Elements-App** `app/monitor-fe` (ab F-16, [09](09_migration_fiori_elements.md)). §4–§8 gelten bis zum Cutover (F-21) noch für die Freestyle-App `app/monitor` und werden mit F-20/F-21 ersetzt.

## 1. Versionen und Bibliotheken

- **SAPUI5 1.148.12 (LTS)** – festgelegt beim Setup (19.10.2026). Version beim Setup festlegen (gültige LTS laut https://ui5.sap.com/versionoverview.html) und in `manifest.json` (`minUI5Version`) sowie `index.html` fest eintragen.
- Bibliotheken: `sap.fe.templates` (zieht `sap.fe.core`, `sap.fe.macros`, `sap.ui.mdc`, `sap.ui.fl`, `sap.uxap`), `sap.m`, `sap.f`, `sap.ui.core`. Keine `sap.ui.comp`, kein `sap.ui.table`. Andere nur nach Abstimmung.
- Theme `sap_horizon`.
- Code muss UI5-2.0-tauglich sein: keine deprecated APIs (`ui5lint` meldet sie). Eigener Code nur in `ext/` (Fragmente, Controller-Extension) und `test/`.

## 2. Projektstruktur `app/monitor-fe` (nach Cutover `app/monitor`)

```
app/monitor-fe/
├── package.json            # ui5 tooling, linter, test-runner
├── ui5.yaml                # cds-plugin-ui5 mountPath /monitor-fe
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

Vertrags-Semantik (Labels, `Common.Text`, Wertehilfen, Kritikalität, Side Effects, `UI.UpdateHidden`) liegt in `srv/monitor-annotations.cds` (E-13, [03 §8](03_service_vertrag.md)); `app/monitor-fe/annotations.cds` wird von CAP automatisch mitgeladen (`cds.resolve('*')`).

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
| `""` (default) | OData V4 | Service-Daten |
| `i18n` | ResourceModel | UI-Texte |
| `appView` | JSONModel (Component) | FCL-Layout, globale Busy-Flags |
| `view` | JSONModel je View | Filterzustand (List), `editMode` (Detail) |
| `message` | Messaging Message Model | MessagePopover |

## 5. OData-V4-Regeln

- Kein manuelles HTTP. Lesen über Bindings; `autoExpandSelect` aktiv, `$expand`/`$select` nur wo nötig in Binding-Parametern.
- **Bearbeiten:** Element-Binding mit `$$updateGroupId: 'changes'`; Sichern über `oModel.submitBatch('changes')`; Verwerfen `oModel.resetChanges('changes')`; Prüfen `oModel.hasPendingChanges('changes')`.
- **Bound function** `availableSteps`:
  ```js
  const oOp = oModel.bindContext("CustomerMonitorService.availableSteps(...)", oRequestContext);
  await oOp.invoke();                                   // ab UI5 1.123; ältere Versionen: execute()
  const aSteps = oOp.getBoundContext().getObject().value;
  ```
- **Bound action** `executeStep`:
  ```js
  const oOp = oModel.bindContext("CustomerMonitorService.executeStep(...)", oRequestContext,
                                 { $$inheritExpandSelect: true });
  oOp.setParameter("step", sStep).setParameter("text", sText)
     .setParameter("businessPartner", sBp).setParameter("force", bForce);
  await oOp.invoke();                                   // sendet If-Match aus dem ETag des Kontexts
  ```
  Danach `oRequestContext.refresh()` für Log/Kompositionen und `requestSideEffects` bzw. Refresh der Listenzeile.
- Fehler: `oError.status` (412, 409, 422 …) und `oError.error.code` (`CONFIRM_REQUIRED`, …) auswerten – ausschließlich in `StepService.js`, Controller bekommen ein normalisiertes Ergebnis `{ outcome: 'ok' | 'confirm' | 'conflict' | 'error', message }`.
- ETag nie umgehen (kein `If-Match: *`).
- **Typen in Ausdrücken/Formattern:** Das V4-Model konvertiert gebundene Werte in den Typ der Control-Property. Boolean/Enum-Werte in Expression Bindings oder Formattern daher mit `targetType: 'any'` binden (z. B. `${path: 'released', targetType: 'any'}`), sonst kommt `"false"` (truthy) bzw. ein Parse-Fehler an.

## 6. Coding-Standards

- Module ausschließlich per `sap.ui.define([...], function (...) { "use strict"; ... })`.
- Controller erben von `BaseController`. Event-Handler `onXxx`, private Methoden `_xxx`.
- Controls über `this.byId()`; keine globalen IDs, kein `sap.ui.getCore().byId()`.
- Fragmente über `this.loadFragment({ name })`, einmal laden, wiederverwenden, beim Exit zerstören.
- Keine Inline-Styles; falls nötig `css/style.css` mit Präfix `custmon`.
- Formatter: pure functions, je eine Unit-Test-Datei.
- Strings: nur i18n. Platzhalter `{0}` via `ResourceBundle#getText(key, [args])`.
- `async/await` statt Promise-Ketten, Fehler immer behandeln (kein unhandled rejection).
- JSDoc für öffentliche Methoden von Services/Utils.
- Busy-Zustände: Page-/Table-`busy` mit `busyIndicatorDelay = 0` für Aktionen.

## 7. i18n-Schlüssel

Schema `<bereich>.<element>[.<variante>]`, z. B. `list.title`, `list.filter.salesOrg`, `detail.section.admin`, `step.dialog.text.title`, `msg.saved`, `msg.conflict412`.
Jeder neue Schlüssel in **beiden** Dateien. Keine Texte für Status/Schritte (kommen vom Service).

## 8. Qualität

| Prüfung | Werkzeug | Befehl |
|---|---|---|
| UI5-Lint (deprecated APIs, Manifest) | `@ui5/linter` | `npm run lint:ui5` → `ui5lint` |
| JS-Lint | ESLint (flat config, `eslint:recommended`, Browser-Globals) | `npm run lint:js` |
| Unit-Tests | QUnit | `npm run test:unit` |
| Integration | OPA5 gegen `cds watch` | `npm run test:opa` |
| Service-Tests | `@cap-js/cds-test` + Jest | `npm run test:srv` |

Tool-Versionen sind in den `package.json` gepinnt (Stand 19.10.2026): `@sap/cds` 9.9.3, `@cap-js/sqlite` 2.4.3, `cds-plugin-ui5` 0.17.4, `@cap-js/cds-test` 1.0.2, `jest` 30.5.2, `@ui5/cli` 4.0.71, `@ui5/linter` 1.23.7, `eslint` 9.39.5 (10.x verlangt Node ≥ 20.19), `ui5-test-runner` 5.14.2.

- `npm run test:unit` / `test:opa` starten den Service selbst (`npm run start:test`, Profil `opa`, Port 4004) – vorher laufendes `cds watch` beenden.
- `ui5-test-runner` installiert beim ersten Lauf Puppeteer (Headless Chrome) global nach.
- Die Testseiten sind klassische QUnit-Seiten; `ui5lint` empfiehlt die Migration auf den Test Starter (Warnung, offen).

## 9. Lokale Entwicklung

- Root: `cds watch` startet Service (Port 4004); `cds-plugin-ui5` served die Apps über UI5-Tooling-Middlewares → FE-App unter `http://localhost:4004/monitor-fe/index.html` (Mount-Pfad in `app/monitor-fe/ui5.yaml`; nach Cutover `/monitor`).
- `ui5.yaml` hat bewusst keinen `framework`-Abschnitt: `index.html` und Testseiten laden SAPUI5 (inkl. `sap.fe.*`) vom CDN. `index.html` setzt `xx-component-preload="off"` und `flexibility-services` auf `SessionStorageConnector` (lokal keine Flex-404s; in Work Zone liefert das Launchpad den Flex-Service).
- Mock-Benutzer: `alice` (Editor + Releaser, VKORG 0001/2000/7050), `bob` (Viewer, VKORG 0001), `carol` (Editor, Sperrtests) in `.cdsrc.json` (`[development]`).
- Headless-Prüfung ohne Browserfenster: `scripts/fe-console.sh [pfad#hash] [budget-ms]` startet den Mock (Profil `opa`), lädt die Seite in Headless Chrome und gibt Konsolenfehler, DOM-Kurzfassung und Screenshot aus (`$TMPDIR/fe-console/shot.png`). `test/debug.html` ergänzt JS-Stacks zu Konsolenfehlern und meldet doppelte mdc-Property-Keys (`DUPKEYS`).
- Bekannte, harmlose Konsolenzeile im Standalone-Lauf: „S/CUBE is not yet supported“ (`sap.fe.core` ContextSharingService versucht, sich am SAP-Insights-Kanal zu registrieren; nur mit Launchpad vorhanden).
- Netzwerk-Inspektion: `$batch`-Requests im Browser-Devtools prüfen; ETag im `If-Match`-Header sichtbar; Aktionen senden `Prefer: handling=strict` ([03 §5.3](03_service_vertrag.md)).
