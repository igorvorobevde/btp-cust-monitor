# FE Migration – Fiori Elements App (F-16 … F-22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freestyle UI5 app with a Fiori Elements for OData V4 app (List Report + Object Page in a FlexibleColumnLayout) over the contract delivered by F-11…F-15, with OPA journeys (`sap.fe.test`) green, then cut over and delete the freestyle app.

**Architecture:** `app/monitor-fe` (renamed to `app/monitor` at cutover) holds a thin `sap.fe.templates` app: `manifest.json` (routing/FCL/table/custom column/header facet/action/controller extension), `annotations.cds` (layout only — the contract semantics live in `srv/monitor-annotations.cds`), two XML fragments, one controller extension, i18n for app texts, and OPA journeys. All UI behaviour (filters, table, header, sections, editing via draft, step actions, dialogs, strict-handling confirm, messages) comes from FE.

**Tech Stack:** SAPUI5 1.148.12 (CDN, `sap.fe.templates`), CAP 9.9.3 with `cds-plugin-ui5`, OPA5 via `sap/fe/test` + `ui5-test-runner` (headless Chrome), `@ui5/linter`, ESLint.

**Spec:** `docs/09_migration_fiori_elements.md` §5 (FE design, V/A markers), §6 (migration), §8 (spike S1–S14); backlog `docs/06_backlog.md` F-16 … F-22; UI spec `docs/04_ui_spezifikation.md` (rewritten in Task 6).

## Global Constraints

- Commit directly on `main` and push after each task (project rule). No throwaway spike branch: each ASSUMED spike item is a verify-or-fallback step inside the task that needs it.
- `cds watch`, `ui5-test-runner` and the screenshot helper need local ports → run outside the sandbox (or enable `sandbox.network.allowLocalBinding`).
- JavaScript only (`sap.ui.define`, no globals, async), `ui5lint` + ESLint clean, all app texts in `webapp/i18n/i18n.properties` **and** `i18n_de.properties`; layout labels referenced from CDS (`{i18n>…}`) go into `_i18n/i18n.properties` + `_i18n/i18n_de.properties`.
- UI5 libraries: `sap.fe.templates` (+ what it pulls), `sap.m`, `sap.f`, `sap.ui.core`; no `sap.ui.comp`, `sap.ui.table`.
- The backend contract is not changed by this plan (if an annotation needs a backend element, that is a ruling + a one-line backend addition in `srv/monitor-annotations.cds`, never a new entity/action).
- Freestyle app `app/monitor` stays untouched (already non-functional since F-12/F-13) until Task 6 deletes it.
- Demo data facts used by tests (from docs/03 §7): 26 requests, 18 open (OPEN+ERROR), 3 × CR_WE; #1 "Müller Hydraulik GmbH" (CR_DEB 000, VKORG 2000); #6 "Bauer Filtertechnik GmbH" (CR_AP 000, editable); #12 closed; #13 in Klärung; #20 CR_WE 010; #26 CH_DEB 000 (BP 1000002 → question, 1000030 free).

## Review Focus

1. **Deep link to a request the user may not see** (viewer `bob` opening a VKORG-2000 request) — FE must show its "not found" state, not a blank page or console error. → Task 2 step "404 deep link".
2. **Step menu while a draft exists** (own or foreign) — every item disabled, never an enabled action that then fails with 409. → Task 3 OPA step "menu disabled during draft".
3. **Strict-handling question vs. ETag conflict** — the question shows a Confirm/Cancel dialog; a stale-ETag 412 shows an error dialog without a Confirm button. → Task 3 OPA step "question dialog" + manual check of the 412 path.
4. **Edit with unsaved changes and navigation to another row** — FE data-loss dialog appears; choosing *Discard* leaves no draft behind (step menu enabled again). → Task 4 OPA step "data loss on navigation".
5. **Old bookmarks `#/requests/<id>`** — must not land on an empty FCL; either rewrite to `#/Requests(ID=…,IsActiveEntity=true)` or show the list. → Task 2 step "hash rewrite".

---

### Task 1: FE app skeleton and List Report (F-16)

**Files:**
- Create: `app/monitor-fe/package.json`, `app/monitor-fe/ui5.yaml`, `app/monitor-fe/eslint.config.mjs`, `app/monitor-fe/annotations.cds`
- Create: `app/monitor-fe/webapp/manifest.json`, `webapp/Component.js`, `webapp/index.html`, `webapp/css/style.css`, `webapp/i18n/i18n.properties`, `webapp/i18n/i18n_de.properties`, `webapp/ext/fragment/HintsColumn.fragment.xml`
- Create: `webapp/test/integration/opaTests.qunit.html`, `opaTests.qunit.js`, `pages/RequestsList.js`, `ListJourney.js`
- Modify: `package.json` (root scripts `lint`, `lint:ui5`, `lint:js`, `test:opa` → `--workspace app/monitor-fe`), `_i18n/i18n.properties` + `_i18n/i18n_de.properties` (layout labels `column.*`)
- Create: `scripts/screenshot.js` (dev helper: headless Chrome screenshot of a URL for visual checks; uses the Chromium that `ui5-test-runner` installs, via `puppeteer-core` if present — otherwise skip and rely on OPA)

**Interfaces:**
- Consumes: service `/odata/v4/monitor/` with `Requests` (draft root), `statusGroup`, criticality fields, value lists, `@cds.search` (F-11…F-15).
- Produces: app id `hydac.custmon`, FE component ids `RequestsList` / `RequestsObjectPage`, routes `RequestsList` (`:?query:`), `RequestsObjectPage` (`Requests({key}):?query:`); page object `onTheList` (`sap.fe.test.ListReport` with `{ appId: "hydac.custmon", componentId: "RequestsList", entitySet: "Requests" }`); OPA runner pattern used by Tasks 2–4: `opaTests.qunit.js` requires `sap/fe/test/JourneyRunner`, builds `new JourneyRunner({ launchUrl: sap.ui.require.toUrl("hydac/custmon") + "/index.html", opaConfig: { timeout: 60, autoWait: true } })` and calls `run(pages, ListJourney.run, …)` where each journey module exports `{ run() { QUnit.module(...); opaTest(...) } }` (Fiori-tools pattern; verify the exact `run` signature against `sap/fe/test/JourneyRunner` in 1.148.12 and adjust — S10).

- [ ] **Step 1: Write the failing OPA journey** — `ListJourney.js`:

```js
sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";
	return {
		run: function () {
			QUnit.module("F-16 List Report");
			opaTest("default filter shows the 18 open requests", function (Given, When, Then) {
				Given.iStartMyApp();
				Then.onTheList.iSeeThisPage();
				Then.onTheList.onFilterBar().iCheckFilterField({ property: "statusGroup" }, "OPEN", { visible: true });
				Then.onTheList.onTable().iCheckRows(18);
			});
			opaTest("process type filter narrows to the 3 ship-to requests", function (Given, When, Then) {
				When.onTheList.onFilterBar().iChangeFilterField({ property: "processType" }, "CR_WE").and.iExecuteSearch();
				Then.onTheList.onTable().iCheckRows(3);
				Then.onTheList.onTable().iCheckColumns(9, { "Status": { visible: true }, "Hinweise": { visible: true } });
				Then.iTeardownMyApp();
			});
		}
	};
});
```
(`iCheckFilterField` value form for a multi-value field, and the column header texts, are verified against `sap.fe.test.api.FilterBarAssertions` / `TableAssertions` docs at 1.148; adjust the matcher, not the intent.)

- [ ] **Step 2: Run it to verify it fails**

Run (outside the sandbox): `npm run test:opa --workspace app/monitor-fe` — expected: FAIL because the app does not exist (404 on the test page). Before that, create only `package.json` + `ui5.yaml` of `app/monitor-fe` (copy from `app/monitor`, name `monitor-fe`, mount `/monitor-fe`, test URLs on `/monitor-fe/...`) and `npm install` at root so the workspace is known.

- [ ] **Step 3: Scaffold the app** (docs/09 §5.1–5.2):
  - `Component.js`: `sap.ui.define(["sap/fe/core/AppComponent"], (AppComponent) => AppComponent.extend("hydac.custmon.Component", { metadata: { manifest: "json" } }))`.
  - `manifest.json`: the manifest from docs/09 §5.2 — `sap.app` (id `hydac.custmon`, i18n bundle, `dataSources.mainService` `/odata/v4/monitor/` 4.0), `sap.ui5.dependencies.libs` `sap.ui.core`, `sap.m`, `sap.f`, `sap.fe.templates`; `flexEnabled: true`; models `i18n` + default (`operationMode: Server`, `autoExpandSelect: true`, `earlyRequests: true`); `routing.config` `{ routerClass: "sap.f.routing.Router", flexibleColumnLayout: { defaultTwoColumnLayoutType: "TwoColumnsMidExpanded" } }`; routes + targets `RequestsList` (`sap.fe.templates.ListReport`, `beginColumnPages`, settings `contextPath: "/Requests"`, `defaultTemplateAnnotationPath: "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Default"`, `initialLoad: "Enabled"`, `variantManagement: "None"`, `navigation.Requests.detail.route: "RequestsObjectPage"`, `controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem"]` with `tableSettings { type: "ResponsiveTable", selectionMode: "None", personalization: { column: true, sort: true, filter: false, group: false }, popinLayout: "GridSmall" }` and custom column `HintsColumn` `{ key, header: "{i18n>list.col.hints}", template: "hydac.custmon.ext.fragment.HintsColumn", availability: "Default", importance: "High", width: "5.5rem", properties: ["released","inClarification","orderExists"], position: { placement: "After", anchor: "DataField::status_code" } }`, `controlConfiguration["@com.sap.vocabularies.UI.v1.SelectionFields"].filterFields.$editState.availability: "Hidden"`) and `RequestsObjectPage` (`sap.fe.templates.ObjectPage`, `midColumnPages`, `contextPath: "/Requests"`, `editableHeaderContent: false`, `showRelatedApps: false`) — the OP gets its content in Task 2.
  - `index.html`: copy of the freestyle one (CDN 1.148.12, horizon, `ComponentSupport`, preload off).
  - `annotations.cds` (`using CustomerMonitorService as service from '../../srv/monitor-service';`): `UI.HeaderInfo` (TypeName `{i18n>request}`, TypeNamePlural `{i18n>requests}`, Title `name`, Description `{ $edmJson odata.concat processTypeRef/text ' · ' magentoCompany }` — fallback `Description: { Value: processType }` if the concat does not compile/render), `UI.SelectionFields` (13 fields per docs/09 §5.3), `UI.SelectionVariant #Default` (statusGroup EQ OPEN, EQ ERROR), `UI.PresentationVariant #Default` (createdAt asc, Visualizations `['@UI.LineItem']`), `UI.SelectionPresentationVariant #Default`, `UI.LineItem` (status_code with Criticality + `#WithIcon` + Importance High; processType; FieldGroup#Name (name, name2) High; customer; salesOrganization; magentoCompany; orderVolume; FieldGroup#Created; FieldGroup#Changed — Medium), `UI.LineItem.@UI.Criticality: orderCriticality`, the three FieldGroups. Column labels for the FieldGroup columns: `{i18n>column.name}`, `{i18n>column.created}`, `{i18n>column.changed}` → add to `_i18n` (EN: Name / Created / Changed; DE: Name / Erstellt / Geändert).
  - `HintsColumn.fragment.xml`: `<core:FragmentDefinition xmlns:core="sap.ui.core" xmlns="sap.m"><HBox><core:Icon src="sap-icon://locked" visible="{= !${released}}" tooltip="{i18n>list.hint.notReleased}" class="custmonHintIcon"/> … question-mark on inClarification, cart on orderExists</HBox></core:FragmentDefinition>`.
  - `css/style.css`: `.custmonHintIcon { margin-right: 0.25rem; }`.
  - `webapp/i18n`: `appTitle`, `appDescription`, `list.col.hints`, `list.hint.notReleased`, `list.hint.inClarification`, `list.hint.orderExists`, `common.refresh` (EN + DE, texts from the freestyle bundle).
  - `eslint.config.mjs`: copy. `package.json` scripts: `lint`, `lint:ui5`, `lint:js`, `test:opa` (URL `/monitor-fe/test/integration/opaTests.qunit.html`). Root `package.json`: `lint*` and `test:opa` → `--workspace app/monitor-fe`.
  - OPA: `opaTests.qunit.html` (as the freestyle one with resource roots `hydac.custmon` → `../../`, `hydac.custmon.test` → `../`), `opaTests.qunit.js` (JourneyRunner pattern from Interfaces), `pages/RequestsList.js` (`sap.ui.define(["sap/fe/test/ListReport"], (ListReport) => new ListReport({ appId: "hydac.custmon", componentId: "RequestsList", entitySet: "Requests" }))`).

- [ ] **Step 4: Verify in the running app** (S1, S4, S9): `cds watch` → `GET http://localhost:4004/monitor-fe/index.html` returns 200 and `GET http://localhost:4004/odata/v4/monitor/$metadata` contains `UI.SelectionPresentationVariant` with qualifier `Default`; `npx cds compile srv app --to edmx | grep -c 'UI.LineItem'` ≥ 1; `npm run lint` clean; `mcp__ui5-mcp-server__run_manifest_validation` on the manifest (if available). If a screenshot helper is feasible, capture `index.html` and look at it (Hints column after Status, 18 rows, filter bar with Statusgruppe pre-filled).

- [ ] **Step 5: Run the OPA journey to verify it passes**

Run: `npm run test:opa` (root) — Expected: PASS 2/2. If `JourneyRunner.run` signature or `iCheckFilterField` value form differ, adjust per the 1.148 API and ledger the change.

- [ ] **Step 6: Docs and commit**

`docs/05_ui5_konventionen.md` §1 (libraries incl. `sap.fe.templates`), §2 (structure of `app/monitor-fe`), §3 (manifest essentials), §9 (`/monitor-fe` URL) — short rewrite of those sections; `docs/06` F-16 → erledigt.

```bash
git add app/monitor-fe package.json package-lock.json _i18n docs/05_ui5_konventionen.md docs/06_backlog.md scripts
git commit -m "feat(F-16): Fiori Elements app skeleton with List Report"
git push
```

---

### Task 2: Object Page read-only (F-17)

**Files:**
- Modify: `app/monitor-fe/annotations.cds` (HeaderFacets, DataPoints, Facets, FieldGroups incl. compositions, log LineItem/PresentationVariant), `webapp/manifest.json` (OP `content.header.facets.ClarificationStrip`, `controlConfiguration["log/@com.sap.vocabularies.UI.v1.LineItem"].tableSettings`), `webapp/Component.js` (hash rewrite for old bookmarks)
- Create: `webapp/ext/fragment/ClarificationStrip.fragment.xml`, `webapp/test/integration/pages/RequestsObjectPage.js`, `webapp/test/integration/DetailJourney.js`
- Modify: `_i18n/i18n*.properties` (`section.*`, `group.*`, `facet.*` labels), `webapp/i18n` (`detail.clarification`)

**Interfaces:**
- Consumes: Task 1 skeleton; `onTheList`.
- Produces: `onTheDetail` (`sap.fe.test.ObjectPage` `{ appId: "hydac.custmon", componentId: "RequestsObjectPage", entitySet: "Requests" }`); section ids `MainSection`, `AdminSection`, `SalesSection`, `ShipToSection`, `AssignmentSection`, `LogSection`; header facet ids `StatusPoint`, `ReleasePoint`, `KeyFigures`, `AdminData`, `ClarificationStrip`.

- [ ] **Step 1: Write the failing journey** — `DetailJourney.js`:

```js
QUnit.module("F-17 Object Page");
opaTest("deep link opens #20 with ship-to section and without admin section", function (Given, When, Then) {
	Given.iStartMyApp("Requests(ID=a1b2c3d4-0000-4000-8000-000000000020,IsActiveEntity=true)");
	Then.onTheDetail.iSeeThisPage();
	Then.onTheDetail.onHeader().iCheckTitle("Rheintal Logistik GmbH"); // #20 name from the CSV — adjust to the actual value
	Then.onTheDetail.iSeeSectionWithTitle("Warenempfänger");            // sap.fe.test ObjectPage assertion name per 1.148 API
	Then.onTheDetail.iDoNotSeeSectionWithTitle("Ansprechpartner");
});
opaTest("row click opens #13 with the clarification strip and newest log first", function (Given, When, Then) {
	When.onTheList.onFilterBar().iChangeFilterField({ property: "inClarification" }, "true").and.iExecuteSearch();
	When.onTheList.onTable().iPressRow({ name: "<name of #13>" });
	Then.onTheDetail.iSeeThisPage();
	Then.onTheDetail.onHeader().iCheckMessageStrip("In Klärung"); // custom header facet → use a generic Opa5 waitFor on sap.m.MessageStrip if no FE assertion exists
	Then.onTheDetail.onTable({ property: "log" }).iCheckRows();
	Then.iTeardownMyApp();
});
```
Read names of #13/#20 from `db/data/hydac.custmon-Requests.csv` before writing the literals.

- [ ] **Step 2: Run it to verify it fails** — `npm run test:opa` → FAIL (no sections).

- [ ] **Step 3: Annotate the Object Page** (docs/09 §5.3): `UI.HeaderFacets` (DataPoint#Status, DataPoint#Release, FieldGroup#KeyFigures, FieldGroup#AdminData), `UI.Facets` (CollectionFacet `MainSection` with sub-FieldGroups MainName/MainAddress/MainComm/MainTax; `AdminSection` → `admin/@UI.FieldGroup#Admin` with `![@UI.Hidden]: { $edmJson: { $Eq: [{ $Path: 'processType' }, 'CR_WE'] } }`; `SalesSection` → `salesData/@UI.FieldGroup#Sales`; `ShipToSection` → `shipTo/@UI.FieldGroup#ShipTo` with `$Ne` (S4 — if `$Ne` is rejected, use `$Not: { $Eq: … }`); CollectionFacet `AssignmentSection` (SapNumbers/Magento/ReleaseGrp); `LogSection` → `log/@UI.PresentationVariant#Log` (S7 — fallback `log/@UI.LineItem`)). `UI.ConnectedFields` for street+houseNumber / postalCode+city in MainAddress and ShipTo (S6 — fallback: two plain fields). `annotate service.ContactPersons/SalesData/ShipToParties with @UI.FieldGroup#…`; `annotate service.LogEntries with @UI.LineItem` + `@UI.PresentationVariant #Log` (SortOrder `line` desc). Labels `{i18n>section.main|admin|sales|shipTo|assignment|log}`, `{i18n>group.name|address|communication|tax|sapNumbers|magento|release}`, `{i18n>facet.keyFigures|adminData|status|release}` → `_i18n` EN/DE (German texts as in docs/04: Hauptdaten, Ansprechpartner, Vertriebsdaten, Warenempfänger, Zuordnung, Protokoll, …).
  `ClarificationStrip.fragment.xml`: `<core:FragmentDefinition …><MessageStrip type="Warning" showIcon="true" visible="{= !!${inClarification}}" text="{parts: [{path: 'i18n>detail.clarification'}, {path: 'clarificationComment'}], formatter: 'sap.base.strings.formatMessage'}"/></core:FragmentDefinition>` (if the formatter path is not resolvable in a fragment, use an expression binding with `{i18n>detail.clarificationPrefix}` + `${clarificationComment}`). Manifest: `content.header.facets.ClarificationStrip { template, position: { placement: "Before", anchor: "StatusPoint" } }`; `controlConfiguration["log/@com.sap.vocabularies.UI.v1.LineItem"].tableSettings { type: "ResponsiveTable", selectionMode: "None", personalization: false }`.
  `Component.js` hash rewrite (Review Focus 5): in `init`, if `location.hash` matches `#/requests/<uuid>(/full)?`, replace it with `#/Requests(ID=<uuid>,IsActiveEntity=true)` before calling `AppComponent.prototype.init`.

- [ ] **Step 4: Verify** (S1, S4, S6, S7, S11): `npx cds compile srv app --to edmx | grep -c 'UI.Facets'` ≥ 1 and no compile errors; in the running app open `#/Requests(ID=…20…,IsActiveEntity=true)` (screenshot if the helper works) — two-column layout, ShipTo visible, Admin hidden, log sorted desc, strip present on #13; open `#/requests/a1b2c3d4-0000-4000-8000-000000000020` → rewritten; `bob` deep link to #2 → FE "not found" message (Review Focus 1: check the OP shows an illustrated message, no console error — via screenshot or OPA with `Given.iStartMyApp` + a generic waitFor on `sap.m.IllustratedMessage`).

- [ ] **Step 5: Run the OPA journeys** — `npm run test:opa` → PASS (Task 1 + Task 2 journeys).

- [ ] **Step 6: Docs and commit** — `docs/06` F-17 → erledigt (note fallbacks taken for S4/S6/S7).

```bash
git add app/monitor-fe _i18n docs/06_backlog.md
git commit -m "feat(F-17): Object Page with header, sections, log and clarification strip"
git push
```

---

### Task 3: Step actions in the UI (F-18)

**Files:**
- Modify: `app/monitor-fe/annotations.cds` (`UI.Identification` with `DataFieldForActionGroup #Steps`), `webapp/manifest.json` (OP `content.header.actions.Refresh`, `extends.extensions.sap.ui.controllerExtensions`), `webapp/i18n` (`detail.action.step`, `common.refresh`, `C_OPERATIONS_ACTION_CONFIRM_MESSAGE|Requests|reset` …)
- Create: `webapp/ext/controller/ObjectPageExt.controller.js`, `webapp/test/integration/StepJourney.js`

**Interfaces:**
- Consumes: actions `release` … `changeCustomerAssignment` with `can*` flags; strict handling (F-14); `onTheDetail`.
- Produces: controller extension `hydac.custmon.ext.controller.ObjectPageExt` with `onRefresh()` and `override.editFlow.onBeforeEdit()`; action group id `Steps`.

- [ ] **Step 1: Write the failing journey** — `StepJourney.js`:

```js
QUnit.module("F-18 Steps");
opaTest("#26: question with strict handling, confirm → status 110, toast", function (Given, When, Then) {
	Given.iStartMyApp("Requests(ID=a1b2c3d4-0000-4000-8000-000000000026,IsActiveEntity=true)");
	When.onTheDetail.onHeader().iExecuteMenuAction({ id: "Steps" }, "Zuordnung zu Debitor ändern"); // label from _i18n de/en per test language (test page runs with language en → "Change Customer Assignment")
	When.onTheDetail.onDialog().iChangeDialogField({ property: "businessPartner" }, "1000002").and.iConfirm();
	Then.onTheDetail.onDialog().iCheckMessageDialog?.() // if available; else generic waitFor on sap.m.Dialog with the question text /4000002/
	When.onTheDetail.onDialog().iConfirm();            // strict-handling confirm
	Then.onTheDetail.onHeader().iCheckDataPoint({ property: "status_code" }, "Customer Assignment Changed"); // adjust to the FE assertion that reads the header DataPoint
});
opaTest("#12 (closed): only 'Process Again' is enabled", function (Given, When, Then) {
	Given.iStartMyApp("Requests(ID=a1b2c3d4-0000-4000-8000-000000000012,IsActiveEntity=true)");
	Then.onTheDetail.onHeader().iCheckMenuAction({ id: "Steps" }, "Process Again", { enabled: true });
	Then.onTheDetail.onHeader().iCheckMenuAction({ id: "Steps" }, "Release", { enabled: false });
	Then.iTeardownMyApp();
});
```
Pin the exact `sap.fe.test` assertion names for menu actions / dialogs (`HeaderActions.iExecuteMenuAction`, `DialogActions`, `HeaderAssertions.iCheckAction`/`iCheckMenuAction`) from the 1.148 api.json before running; keep the intent.

- [ ] **Step 2: Run it to verify it fails** — no action group yet.

- [ ] **Step 3: Implement**: `UI.Identification: [{ $Type: 'UI.DataFieldForActionGroup', ID: 'Steps', Label: '{i18n>menu.steps}', Actions: [ 11 × { $Type: 'UI.DataFieldForAction', Action: 'CustomerMonitorService.<name>', Label: '{i18n>action.<name>}' } ] }]` with `rejectRequest` and `reset` last (labels already in `_i18n`; add `menu.steps` = "Execute Step" / "Schritt ausführen"). Controller extension:

```js
sap.ui.define(["sap/ui/core/mvc/ControllerExtension"], function (ControllerExtension) {
	"use strict";
	return ControllerExtension.extend("hydac.custmon.ext.controller.ObjectPageExt", {
		override: { editFlow: { onBeforeEdit: function () { return this.base.getExtensionAPI().refresh(); } } },
		onRefresh: function () { return this.base.getExtensionAPI().refresh(); }
	});
});
```
Manifest: `content.header.actions.Refresh { press: ".extension.hydac.custmon.ext.controller.ObjectPageExt.onRefresh", text: "{i18n>common.refresh}", position: { placement: "After", anchor: "DataFieldForActionGroup::Steps" } }`; `extends.extensions.sap.ui.controllerExtensions["sap.fe.templates.ObjectPage.ObjectPageController"].controllerName = "hydac.custmon.ext.controller.ObjectPageExt"`. i18n override for the reset confirmation text: key `C_OPERATIONS_ACTION_CONFIRM_MESSAGE|Requests|reset` (EN/DE) — verify the key format in FE docs ("Adding Confirmation Popups to Actions"); if unsupported, accept the FE default text and ledger it.

- [ ] **Step 4: Verify** (S2, S3, S5, S12, S13, S14-part): network trace in the running app shows `$select` with `can*` on the OP request; `rejectRequest` opens a dialog with a multi-line text field, mandatory; the question dialog for BP 1000002 shows Confirm/Cancel; a stale ETag (change the request in a second session via `curl` then press an action) shows an error dialog without Confirm; after `release` on #18 the list row's status text updates (if not: add `TargetEntities: ['/CustomerMonitorService.EntityContainer/Requests']` to the side effects in `srv/monitor-annotations.cds` — ruling). Review Focus 2: open #6, press Edit, verify every menu item is disabled.

- [ ] **Step 5: Run the OPA journeys** — PASS.

- [ ] **Step 6: Docs and commit** — `docs/06` F-18 → erledigt.

```bash
git add app/monitor-fe _i18n docs/06_backlog.md
git commit -m "feat(F-18): step action group, refresh action and controller extension"
git push
```

---

### Task 4: Draft editing in the UI (F-19)

**Files:**
- Modify: `app/monitor-fe/annotations.cds` (nothing new unless ConnectedFields deferred), `webapp/manifest.json` (nothing new; `$editState` already hidden), `webapp/test/integration/DetailJourney.js` (editing journey) or new `EditJourney.js`

**Interfaces:**
- Consumes: draft contract (F-12), `onBeforeEdit` from Task 3.

- [ ] **Step 1: Write the failing journey** — `EditJourney.js`:

```js
QUnit.module("F-19 Draft editing");
opaTest("#6: edit name2 and admin first name, save → log entries", function (Given, When, Then) {
	Given.iStartMyApp("Requests(ID=a1b2c3d4-0000-4000-8000-000000000006,IsActiveEntity=true)");
	When.onTheDetail.onHeader().iExecuteEdit();
	When.onTheDetail.onForm({ section: "MainSection" }).iChangeField({ property: "name2" }, "Werk Nord");
	When.onTheDetail.onForm({ section: "AdminSection" }).iChangeField({ property: "admin/firstName" }, "Erika");
	When.onTheDetail.onFooter().iExecuteSave();
	Then.onTheDetail.onTable({ property: "log" }).iCheckRows({ fieldName: "name2" });
	Then.onTheDetail.onTable({ property: "log" }).iCheckRows({ fieldName: "admin.firstName" });
});
opaTest("edit, change, navigate to another row → data-loss dialog, discard leaves no draft", function (Given, When, Then) {
	When.onTheDetail.onHeader().iExecuteEdit();
	When.onTheDetail.onForm({ section: "MainSection" }).iChangeField({ property: "name2" }, "Verwerfen");
	When.onTheList.onTable().iPressRow({ name: "Müller Hydraulik GmbH" });
	When.onTheDetail.onDialog().iSelectDraftDataLossOption("draftDataLossOptionDiscard"); // DialogMessageActions per 1.148 API
	Then.onTheDetail.onHeader().iCheckTitle("Müller Hydraulik GmbH");
	Then.onTheDetail.onHeader().iCheckMenuAction({ id: "Steps" }, "In Clarification", { enabled: true }); // #1 is not locked
	Then.iTeardownMyApp();
});
```

- [ ] **Step 2: Run to verify it fails** — Edit works already (FE native) but `iCheckRows({ fieldName: "admin.firstName" })` fails if the admin facet is not editable through the 1:1 navigation (S5), or the data-loss option name differs; read the failure, it tells which fallback applies.

- [ ] **Step 3: Implement / adjust**: typically nothing in app code (draft UI is FE-native). If S5 fails (child fields not editable through the facet): fallback per docs/09 — flatten the three editable child groups into custom sections bound via `admin/…` with `sap.m.Input` (ruling + ledger). If `UI.ConnectedFields` was deferred in Task 2, add it here (S6) or keep two fields per row.

- [ ] **Step 4: Verify** (S14): second session (`carol` via a second browser/`curl draftEdit`) — open the same request as `alice`: Edit shows the "locked by" message; after `draft_lock_timeout` behaviour is documented, not tested.

- [ ] **Step 5: Run the OPA journeys** — PASS (all four journeys).

- [ ] **Step 6: Docs and commit** — `docs/06` F-19 → erledigt.

```bash
git add app/monitor-fe docs/06_backlog.md
git commit -m "feat(F-19): draft editing journey and fallbacks"
git push
```

---

### Task 5: OPA consolidation and quality gate (F-20)

**Files:**
- Modify: `app/monitor-fe/webapp/test/integration/*` (journeys ordered, shared `Given.iStartMyApp` per module, teardown), `package.json` root `test` script (`test:srv && test:opa`; `test:unit` removed since the freestyle unit tests go with Task 6 — keep it until Task 6 if it is still green), `docs/05_ui5_konventionen.md` §8

- [ ] **Step 1:** `npm test` (root) outside the sandbox → Expected: srv 75/75, opa all journeys green; `npm run lint` clean.
- [ ] **Step 2:** If journeys are flaky on timing, raise `opaConfig.timeout` and add `autoWait`; never add `sleep`s.
- [ ] **Step 3:** docs/05 §8 rewritten (QUnit gone, `sap.fe.test` journeys, how to run, sandbox/port note). `docs/06` F-20 → erledigt.
- [ ] **Step 4: Commit** — `git commit -m "test(F-20): OPA journeys with sap.fe.test as the quality gate"` and push.

---

### Task 6: Cutover (F-21)

**Files:**
- Delete: `app/monitor/` (whole freestyle app)
- Move: `app/monitor-fe/` → `app/monitor/`; `ui5.yaml` mount `/monitor`; app `package.json` name `monitor`, test URLs `/monitor/...`; root `package.json` scripts back to `--workspace app/monitor`, `test:unit` removed, `test` = `test:srv && test:opa`, description updated
- Modify: `README.md` (app URL `/monitor/index.html`, FE, deep-link format, HANA Cloud from phase 2), `CLAUDE.md` (rules 1/4/5/6 rewritten for FE; migration note removed; project paragraph; commands), `docs/04_ui_spezifikation.md` (rewritten as FE spec per docs/09 §9), `docs/05_ui5_konventionen.md` (remaining sections), `docs/08_demo_szenarien.md` (filter fields, action menu, dialogs, `carol` lock), `docs/06` F-21 → erledigt, `docs/02` §4 (structure)
- Modify: `app/monitor/webapp/i18n/*` — remove unused freestyle keys (keep `appTitle`, `appDescription`, `list.col.hints`, `list.hint.*`, `detail.clarification*`, `common.refresh`, `menu/confirm` overrides)

- [ ] **Step 1:** `git mv`/`rm`, script edits; `rm -rf node_modules/monitor* && npm install` if the workspace symlink is stale.
- [ ] **Step 2: Verify** — fresh checkout simulation: `npm install && npm run lint && npm test` (outside the sandbox) green; `cds watch` serves only `/monitor`; `grep -rn "availableSteps\|executeStep\|FilterBuilder\|StepService\|monitor-fe" docs app srv README.md CLAUDE.md` → only historical notes in docs/06 and docs/09.
- [ ] **Step 3: Docs** — the four docs above; keep German, keep domain terms.
- [ ] **Step 4: Commit** — `git commit -m "feat(F-21): cutover to the Fiori Elements app, freestyle app removed"` and push.

---

### Task 7: Polish (F-22)

**Files:** `app/monitor/webapp/manifest.json` (column widths via `controlConfiguration` `columns` `width`, `popinLayout`), `annotations.cds` (Importance tuning), `webapp/i18n` tooltips, `docs/04` (deep-link section), `docs/06` F-10/F-22 → erledigt, user note on the 15-min draft lock in `README.md`.

- [ ] **Step 1:** Visual pass (screenshots of list, OP of #1/#13/#20 in EN and DE) against docs/04; fix widths/importance; no console errors (check `cds watch` log and the browser console via the screenshot helper's console capture).
- [ ] **Step 2:** `npm run lint && npm test` green; commit `chore(F-22): visual polish and docs` and push.
