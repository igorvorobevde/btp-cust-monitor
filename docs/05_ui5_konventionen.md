# 05 – UI5-Konventionen (Freestyle, JavaScript)

## 1. Versionen und Bibliotheken

- **SAPUI5 1.148.12 (LTS)** – festgelegt beim Setup (19.10.2026). Version beim Setup festlegen (gültige LTS laut https://ui5.sap.com/versionoverview.html) und in `manifest.json` (`minUI5Version`) sowie `index.html` fest eintragen.
- Bibliotheken: `sap.m`, `sap.f`, `sap.uxap`, `sap.ui.layout`, `sap.ui.core`. Andere nur nach Abstimmung.
- Theme `sap_horizon`.
- Code muss UI5-2.0-tauglich sein: keine deprecated APIs (`ui5lint` meldet sie).

## 2. Projektstruktur `app/monitor`

```
app/monitor/
├── package.json            # ui5 tooling, linter, test-runner
├── ui5.yaml
└── webapp/
    ├── Component.js
    ├── manifest.json
    ├── index.html          # nur lokal; Bootstrap von ui5.sap.com (fixe Version)
    ├── i18n/
    │   ├── i18n.properties       # EN (Fallback)
    │   └── i18n_de.properties
    ├── view/
    │   ├── App.view.xml          # FlexibleColumnLayout
    │   ├── List.view.xml
    │   ├── Detail.view.xml
    │   └── fragments/
    │       ├── DetailMainData.fragment.xml
    │       ├── DetailAdmin.fragment.xml
    │       ├── DetailSales.fragment.xml
    │       ├── DetailShipTo.fragment.xml
    │       ├── DetailAssignment.fragment.xml
    │       ├── DetailLog.fragment.xml
    │       ├── StepTextDialog.fragment.xml
    │       └── StepBusinessPartnerDialog.fragment.xml
    ├── controller/
    │   ├── BaseController.js     # getRouter, getModel, getResourceBundle, navTo
    │   ├── App.controller.js
    │   ├── List.controller.js
    │   └── Detail.controller.js
    ├── model/
    │   ├── models.js             # Device-Model u. ä.
    │   └── formatter.js          # reine Funktionen, keine Seiteneffekte
    ├── service/
    │   └── StepService.js        # availableSteps/executeStep + Fehler-Mapping
    ├── util/
    │   ├── ErrorHandler.js       # zentrale Behandlung techn. Fehler
    │   └── FilterBuilder.js      # Filterzustand → sap.ui.model.Filter
    └── test/
        ├── unit/                 # QUnit: formatter, FilterBuilder, StepService
        └── integration/          # OPA5: Journeys gegen laufenden CAP-Mock
```

## 3. manifest.json (Kernpunkte)

```json
{
  "sap.app": {
    "id": "hydac.custmon",
    "dataSources": {
      "mainService": { "uri": "/odata/v4/monitor/", "type": "OData", "settings": { "odataVersion": "4.0" } }
    }
  },
  "sap.ui5": {
    "rootView": { "viewName": "hydac.custmon.view.App", "type": "XML", "async": true, "id": "app" },
    "models": {
      "": { "dataSource": "mainService", "preload": true,
            "settings": { "operationMode": "Server", "autoExpandSelect": true, "earlyRequests": true } },
      "i18n": { "type": "sap.ui.model.resource.ResourceModel",
                "settings": { "bundleName": "hydac.custmon.i18n.i18n", "supportedLocales": ["", "de"], "fallbackLocale": "" } }
    },
    "routing": { "config": { "routerClass": "sap.f.routing.Router", "type": "View", "viewType": "XML",
                             "path": "hydac.custmon.view", "controlId": "fcl" } }
  }
}
```

- `supportedLocales` enthält `""` (nicht `"en"`): `i18n.properties` ist der englische Fallback; mit `"en"` würde UI5 `i18n_en.properties` suchen.
- `_version` 2.0.0: `routing/config/async` entfällt (Manifest 2 ist immer async; `ui5lint` meldet es sonst als Fehler).

Routen und Layouts: siehe [04_ui_spezifikation.md §1](04_ui_spezifikation.md#1-layout-und-navigation).

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

- Root: `cds watch` startet Service (Port 4004); `cds-plugin-ui5` (abgestimmt 19.10.2026) served die App über UI5-Tooling-Middlewares → App unter `http://localhost:4004/monitor/index.html` (Mount-Pfad in `app/monitor/ui5.yaml`).
- `ui5.yaml` hat bewusst keinen `framework`-Abschnitt: `index.html` und Testseiten laden SAPUI5 vom CDN, ein lokaler Framework-Download entfällt. `index.html` setzt `xx-component-preload="off"` (ungebaut gibt es keine `Component-preload.js`).
- Mock-Benutzer: `alice` (Editor + Releaser, VKORG 0001/2000/7050), `bob` (Viewer, VKORG 0001) in `.cdsrc.json` (`[development]`).
- Netzwerk-Inspektion: `$batch`-Requests im Browser-Devtools prüfen; ETag im `If-Match`-Header sichtbar.
