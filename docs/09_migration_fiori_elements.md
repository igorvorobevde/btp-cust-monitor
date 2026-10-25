# 09 – Migration of the frontend to SAP Fiori Elements (OData V4)

Status: **decided 2026-10-22**, implementation open (backlog F-11 … F-22, B-06 in [06](06_backlog.md)).
Language: English by decision; domain terms stay German (Debitor, Warenempfänger, Freigabe, Klärung).

This document is the architecture and migration plan for replacing the freestyle SAPUI5 app in `app/monitor` with an
SAP Fiori Elements (FE) for OData V4 application. It supersedes rule 1 of `CLAUDE.md` and decision E-02 in [02](02_architektur.md)
from backlog item F-15 on. Where this document and [03](03_service_vertrag.md)/[04](04_ui_spezifikation.md)/[05](05_ui5_konventionen.md)
disagree, this document wins until those documents have been rewritten (F-15, F-16, F-21).

## 1. Why

| Motivation | What it means here |
|---|---|
| Less custom code to maintain | ~2,100 lines of JS/XML (plus 620 lines of tests) become ~300 lines of FE extensions plus ~250 lines of annotations. Formatter, FilterBuilder, StepService, ErrorHandler, dialogs and controllers disappear. |
| Standard Fiori UX / launchpad fit | Filter bar, table, object page, messages, data-loss dialogs, FCL, personalisation come from `sap.fe.templates`; the app behaves like other Fiori apps in Work Zone. |
| Alignment with S/4 phase 2 | All UI semantics live in CDS annotations in the CAP service. When the real S/4 service is connected, the UI does not change (rule 8, "mock = contract"). |

Reference style: the Purplecat project `jowat-webshop-registration-main` (one bound action per status transition,
status as a code list, annotations in `app/annotations.cds`, no hand-written UI). The folder is kept in the repo root as an
untracked reference only (`.gitignore`).

## 2. Decisions

| ID | Decision | Consequence |
|---|---|---|
| D-1 | **One bound action per step** on `Requests` (`release`, `rejectRequest(reason)`, `clarify(comment)`, `reset`, `createCustomer`, `createShipTo`, `modifyContact`, `convertToNewCustomer`, `completeManually`, `assignExistingCustomer(businessPartner)`, `changeCustomerAssignment(businessPartner)`). Enablement via `@Core.OperationAvailable` bound to backend-computed `can*` flags. Confirmations via `@Common.IsActionCritical` and FE parameter dialogs. `409 CONFIRM_REQUIRED` + `force` is replaced by **OData strict handling** (412 + `Preference-Applied: handling=strict`). `availableSteps`/`executeStep` leave the contract. | [03](03_service_vertrag.md) §4/§5 rewritten; E-04 rewritten; `srv/lib/status-machine.js` stays the single source of "what is allowed". |
| D-2 | **Standard FE filter fields** replace the four checkboxes: `statusGroup` (multi-select, default OPEN + ERROR), `released` and `inClarification` (Boolean), value helps from code lists. | Backend exposes a filterable `statusGroup`; the status-code range logic leaves the UI (rule 7). [04](04_ui_spezifikation.md) §2.1 rewritten. |
| D-3 | **Backend stays JavaScript** (no TypeScript / cds-typer in this migration). | Only annotations, actions, fields and handler changes in `srv/`. |
| D-4 | This document is written in **English**; docs 01–08 stay German. | — |
| D-5 | **`Requests` becomes draft-enabled** (E-12). FE V4 Object Page editing exists only for draft (or sticky-session) entity sets — verified in the `sap.fe` 1.148.12 sources (`HeaderAndFooterAction`, `TransactionHelper`) and SAP documentation. A non-draft edit flow would have to be hand-written (~600 lines) and would forfeit most FE benefits. | Composite key `ID` + `IsActiveEntity`, draft actions, draft lock while editing; E-05 reworded; a persistent database is required from phase 2. |
| D-6 | **Phase 2 = replication** (E-14): CAP keeps a HANA replica of `Requests` (+ `salesData`, `admin`, `shipTo`, `log`) with write-through after every S/4 call and a delta pull on list reads. S/4 remains system of record for steps and master-data creation (E-06 unchanged). This is needed **with or without draft**: CAP's generic ETag validation for bound actions and the draft lock query run directly against the local table. | SAP HANA Cloud becomes a required BTP service (phase 2/3); new backlog item B-06. |

Rules that continue to apply: OData V4 model only; backend decides what is allowed; ETag on `draftEdit`, draft PATCHes and
every step action; mock = contract; all UI texts in i18n (EN fallback + DE), status/step/process-type/release texts from the
service; `npm run lint` clean, `npm test` green, `cds watch` without console errors.

## 3. Target architecture

```
Work Zone / Approuter
   └─ FE app  app/monitor  (sap.fe.templates ListReport + ObjectPage, FlexibleColumnLayout)    ← ~300 lines own code
        │  OData V4  ($metadata carries all UI semantics; draft-enabled root)
   CAP  CustomerMonitorService (srv/)
        ├─ srv/monitor-service.cds        entities (draft root), 11 bound step actions, capabilities, @restrict
        ├─ srv/monitor-annotations.cds    CONTRACT semantics: labels ({i18n>}), Common.Text, value lists,
        │                                  criticality paths, side effects, UI.UpdateHidden
        ├─ app/monitor/annotations.cds    LAYOUT only: SelectionFields, LineItem, HeaderInfo, Facets, action group
        ├─ srv/monitor-service.js         after-READ flags, generic action dispatcher, strict handling,
        │                                  EDIT guard, activation change log
        └─ srv/lib/status-machine.js      UNCHANGED
   Phase 1: SQLite in-memory (drafts volatile)   |   Phase 2: HANA replica ⇄ S/4 (get_functions / execute_function / change_data)
```

Annotation ownership (E-13): everything in `srv/monitor-annotations.cds` is part of the service contract (labels, texts,
value helps, criticality paths, side effects, edit visibility). `app/monitor/annotations.cds` holds only layout
(which fields where, in which order). Both files are compiled into `$metadata` by CAP.

## 4. Service contract changes (backend)

All CDS below was compiled against the real model (EDMX + SQLite SQL); the critical runtime paths (strict handling incl.
`$batch`, calculated elements with `$filter`/`$orderby`/`groupby`/localized texts, `@mandatory` → `ASSERT_MANDATORY`,
CAP's generic ETag check on bound actions, the lean-draft edit/activate flow) were exercised against `@sap/cds` 9.9.3.

### 4.1 Actions

| Step (customizing) | Action (all `returns Requests`) | Parameters | Confirmation |
|---|---|---|---|
| RELEASE | `release()` | – | `@Common.IsActionCritical` |
| REJECT | `rejectRequest(reason)` — `reject` is a reserved `cds.ApplicationService` method | `@mandatory @UI.MultiLineText reason : String(100)` | parameter dialog |
| CLARIFY | `clarify(comment)` | `@mandatory @UI.MultiLineText comment : String(100)` | parameter dialog |
| RESET | `reset()` | – | IsActionCritical |
| CREATE | `createCustomer()` | – | IsActionCritical (keeps E-09) |
| CREATE_WE | `createShipTo()` | – | IsActionCritical |
| AP_MODIFY | `modifyContact()` | – | IsActionCritical |
| CNG_NEW | `convertToNewCustomer()` | – | IsActionCritical |
| MANUAL_OK | `completeManually()` | – | IsActionCritical |
| CHNG_OLD | `assignExistingCustomer(businessPartner)` | `@mandatory businessPartner : String(10)` | parameter dialog; question via strict handling |
| CNG_DEBI | `changeCustomerAssignment(businessPartner)` | `@mandatory businessPartner : String(10)` | parameter dialog; question via strict handling |

```cds
@odata.draft.enabled
@UI.UpdateHidden: editHidden
@(Capabilities: { InsertRestrictions.Insertable: false, DeleteRestrictions.Deletable: false })
@restrict: [
  { grant: 'READ', to: 'MonitorViewer' },
  { grant: ['UPDATE', 'release', 'rejectRequest', 'clarify', 'reset', 'createCustomer', 'createShipTo',
            'modifyContact', 'convertToNewCustomer', 'completeManually',
            'assignExistingCustomer', 'changeCustomerAssignment'], to: 'MonitorEditor' }
]
entity Requests as projection on db.Requests actions {
  @Common.IsActionCritical @Core.OperationAvailable: ( :in.canRelease )
  action release(in : $self) returns Requests;
  @Core.OperationAvailable: ( :in.canReject )
  action rejectRequest(in : $self,
    @mandatory @title: '{i18n>param.reason}' @UI.MultiLineText reason : String(100)) returns Requests;
  /* … clarify, reset, createCustomer, createShipTo, modifyContact, convertToNewCustomer, completeManually,
       assignExistingCustomer, changeCustomerAssignment analogously … */
};

annotate CustomerMonitorService.Requests with actions {
  release @Common.SideEffects: {
    TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType',
                       'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/inClarification',
                       'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer',
                       'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/isEditable', 'in/editHidden',
                       'in/canRelease', /* … all can* … */ 'in/canChangeCustomerAssignment'],
    TargetEntities:   ['in/log', 'in/admin', 'in/shipTo', 'in/salesData']
  };
  /* identical block for the other ten actions */
}
```

- `@Core.OperationAvailable: ( :in.canXxx )` with the explicit binding parameter `in : $self` compiles to EDMX `Path="in/canXxx"` (verified).
- The `@restrict` grant list must name every action (CAP answers 403 for unlisted actions). The releaser role is enforced in the status machine (`canRelease`).
- Actions are offered only on the Object Page header of the **active** instance, never on drafts and never in the list toolbar (keeps list reads cheap in phase 2).
- Removed from the contract: `availableSteps`, `executeStep`, type `StepOption`, error codes `CONFIRM_REQUIRED` (409) and `INPUT_REQUIRED` (replaced by CAP's generic `ASSERT_MANDATORY`, 400, `target = <parameter>`). `INPUT_TOO_LONG` stays (CAP does not validate `MaxLength`).

### 4.2 Availability flags and dispatcher

- `virtual canRelease … canChangeCustomerAssignment : Boolean`, `virtual isEditable`, `virtual editHidden` on `db.Requests`.
- Filled in `after READ`, registered on `[Requests, Requests.drafts]`; missing inputs (`status_code, released, inClarification, source, processType`) are re-selected when not in `$select`. Drafts are recognised via `req.target.isDraft`; actives that have a draft are looked up in `Requests.drafts` (lean draft merges `HasDraftEntity` only after the handlers). Flags are never `null` (FE renders `null` as visible-but-disabled).
- **All `can*` are `false` on drafts and on actives whose draft lock is still valid** (last draft change younger than `draft_lock_timeout`; steps and editing are mutually exclusive while someone is editing). After the lock expires, steps are allowed again even if the abandoned draft still exists — a later activation writes only editable fields, so it cannot undo a step (review 25.10.2026). `isEditable = true` on the user's own draft; `editHidden = !isEditable`.
- One generic `on` handler for all 11 events on `[Requests, Requests.drafts]`:
  - draft target → `400 STEP_NOT_ALLOWED`;
  - active with an existing draft → `409 DRAFT_ALREADY_EXISTS` (lean draft does not guard custom actions on actives);
  - otherwise `ACTION_STEPS[req.event]` → `sm.executeStep(step, request, { text | businessPartner, force }, ctx)` — persistence, log entries and the abort log in a separate transaction (R-04) stay as they are; the result row is re-read and returned with flags.
- The source of availability remains the `ProcessSteps` customizing CSV + roles via `sm.availableStepCodes()`.

### 4.3 Strict handling (replaces 409 CONFIRM_REQUIRED + `force`)

FE V4 sends `Prefer: handling=strict` on every action invocation. The handler derives `force = !strict`.

- The status machine throws `CONFIRM_REQUIRED` only when `force = false`. The handler then answers
  `412` with header `Preference-Applied: handling=strict` and the question in `error.details[0]`
  (`code`, `message`, `numericSeverity: 3`). FE shows a confirmation dialog with the details and, on *Confirm*,
  re-invokes the action **without** the `Prefer` header (= confirmed). Verified end-to-end, also inside multipart `$batch`.
- A plain ETag 412 carries no `Preference-Applied` header; FE shows it as an error dialog.
- CAP Node has no built-in strict handling; the implementation is `(req.res ?? req.http.res).set('Preference-Applied', 'handling=strict')` followed by `req.reject({ status: 412, code, message, details: [...] })`.

Messages: exactly one `req.notify` per successful action (FE shows a toast only for exactly one success message),
`req.warn` per message for business error statuses 140/150/160 (HTTP 200 → FE dialog), `target: 'businessPartner'`
for `BP_NOT_FOUND`/`BP_NOT_CUSTOMER` (FE highlights the dialog field).

### 4.4 Draft (E-12)

- `@odata.draft.enabled` on `Requests`: key `ID` + `IsActiveEntity`; `HasActiveEntity`, `HasDraftEntity`, `DraftAdministrativeData`, `SiblingEntity`; `Common.DraftRoot` with `draftEdit` / `draftPrepare` / `draftActivate`; draft nodes `SalesData`, `ContactPersons`, `ShipToParties` (draft tables are generated).
- **`log` becomes `Association to many LogEntries on log.request = $self`** (no `LogEntries_drafts`; the log is not copied into the draft and not rewritten on activation; writes go to `db.LogEntries` directly).
- ETag interplay (verified):
  - `draftEdit` requires `If-Match` of the active (CAP 428 → mapped to 412 `ETAG_REQUIRED`).
  - PATCHes on the draft and its child drafts carry their own ETags (`ChildETag` aspect works on drafts).
  - `draftActivate` requires the draft's ETag and then dispatches a **deep `UPDATE` through the service handlers with `if-match: '*'`**. There is no optimistic check against the active at activation; concurrency is guaranteed by the draft lock plus the EDIT-time ETag check.
  - **Correction (review 25.10.2026):** for draft-enabled entities CAP registers its generic `validate_etag` for bound actions only on the *draft* entity, not on the active one. The service therefore keeps its own `sameETag` check for every step action (the only ETag check on that path) and writes the step result with a conditional `UPDATE … where modifiedAt = <read value>` (412 if no row is affected). `on('error')` maps 428 and CAP's own 412 to the contract text.
  - Activation writes only editable fields: the draft payload carries copies of read-only/computed values from `draftEdit` time, which must not overwrite changes made to the active record meanwhile; the `before UPDATE` handler strips them (`stripReadOnly`).
- Handlers:
  - `before('EDIT', Requests)`: `sm.isEditable(request, isEditor)` else `409 NOT_EDITABLE` (rule E-11 moves from UPDATE to EDIT; kept on UPDATE as a second line).
  - `before('NEW', Requests.drafts)` → `405` (requests are created by Magento only). The CREATE/DELETE guard stays.
  - `before('UPDATE', Requests)` = activation: child `before UPDATE` handlers do **not** fire for the deep payload, so the root handler diffs `req.data` and `req.data.salesData/admin/shipTo` against the old rows and writes one log entry per changed field (`salesData.` / `admin.` / `shipTo.` prefix). Process-type rule (`admin` only when ≠ CR_WE, `shipTo` only when CR_WE) → `409 NOT_EDITABLE`. CAP bumps root and child `modifiedAt`. The manual If-Match/`*` rejection and the parent-ETag bump before commit are obsolete.
- Edit button: `@UI.UpdateHidden: editHidden` (EDMX `Path`, verified).
- Lock: another user's `draftEdit` → `409 DRAFT_ALREADY_EXISTS`; PATCH on a foreign draft → `403 DRAFT_LOCKED_BY_ANOTHER_USER`; step on an active with a draft → `409 DRAFT_ALREADY_EXISTS`.
- Configuration (`.cdsrc.json` → `fiori`): `draft_lock_timeout: "15min"` (extended on every change), `draft_deletion_timeout: "7d"`, `draft_messages: false`. German texts for `DRAFT_LOCKED_BY_ANOTHER_USER`, `DRAFT_ALREADY_EXISTS`, `DRAFT_NOT_EXISTING`, `ENTITY_LOCKED` in `_i18n/messages_de.properties`.
- E-05 reworded: *ETag at `draftEdit` (start of editing), on draft PATCHes and on step actions; pessimistic draft lock while editing (15 min, extended on every change); steps are blocked while a draft exists.*
- Persistence: in phase 1 drafts live in the in-memory SQLite and are lost on every `cds watch` restart (acceptable for the mock). From phase 2 on a persistent database (SAP HANA Cloud, HDI container) is required.
- Tests: mocked user `carol` (MonitorViewer + MonitorEditor, VKORG 0001/2000/7050) in `.cdsrc.json` for lock tests; `cds.test` `data.reset()` truncates the draft tables.

### 4.5 Code lists, texts, criticality, filters

`db/schema.cds`, entity `Requests` (verified; `processType` stays a plain enum because a managed association would rename
the OData property and touch CSV data, the status machine and 20+ tests):

```cds
log                : Association to many LogEntries on log.request = $self;
processTypeRef     : Association to ProcessTypes  on processTypeRef.code  = processType;   // unmanaged: no new column
releaseStateRef    : Association to ReleaseStates on releaseStateRef.code = releaseState;
statusGroup        : String(10) = status.group;                 // calculated on-read; $filter/$orderby/groupby verified
statusCriticality  : Integer    = status.criticality;
orderCriticality   : Integer    = case when orderExists = true then 5 else 0 end;          // row highlight (5 = Information)
releaseCriticality : Integer    = case when released = true then 3 else 2 end;
releaseState       : String(12) = (case when released = true then releaseProcedure else 'NOT_RELEASED' end) stored;
virtual isEditable : Boolean;  virtual editHidden : Boolean;  virtual canRelease : Boolean;  /* … all can* … */
```

- `releaseState` must be `stored` (an on-read calculated element cannot carry an association); it is populated on CSV import, on UPDATE and on draft activation (verified).
- `LogEntries.criticality : Integer` = S → 3, W → 2, E/A → 1, I → 5.
- `Statuses.criticality : Integer` (CSV): 000/010/110/120/130 → 5, 140/150/160 → 1, 899 → 0, 997/998/999 → 3. `Statuses.icon` stays but is unused by FE (icons derive from criticality).
- New code lists `StatusGroups` (OPEN/ERROR/REJECTED/DONE) and `ReleaseStates` (NOT_RELEASED/NOT_REL/AUTOMATIC/MANUAL), each with `_texts` DE/EN.
- Value-help views: `SalesOrganizations as select from db.Requests distinct { key salesOrganization }` with `@restrict … where: 'salesOrganization = $user.SalesOrg'`, and `Sources` analogously; both `@readonly @cds.redirection.target: false`. (`released` restriction for non-releasers is deliberately not applied: the views expose codes only.)
- `Requests.csv`, child CSVs, `LogEntries.csv`, `Steps.csv` are unchanged.

`srv/monitor-annotations.cds` (new, contract-level):

- `status_code @Common.Text: status.text @Common.TextArrangement: #TextOnly`; `processType @Common.Text: processTypeRef.text`; `releaseState @Common.Text: releaseStateRef.text`.
- `@Common.ValueListWithFixedValues` + `@Common.ValueList` for `status_code` → `Statuses`, `processType` → `ProcessTypes`, `statusGroup` → `StatusGroups`; `@Common.ValueList` for `salesOrganization` → `SalesOrganizations`, `source` → `Sources`.
- `@title: '{i18n>field.*}'` on every element and action parameter; `@UI.Hidden` on `statusCriticality`, `orderCriticality`, `releaseCriticality`, `editHidden`.
- `@cds.search` on `name`, `name2`, `magentoCompany` (FE basic search sends `$search`).

### 4.6 i18n

- New `_i18n/i18n.properties` (EN fallback) and `_i18n/i18n_de.properties` = CAP label bundle (basename `i18n`, folders `_i18n`/`i18n` — verified defaults). `_i18n/messages*.properties` stays the runtime-message bundle.
- The 49 `field.*` keys move 1:1 from `app/monitor/webapp/i18n` (the two composite labels `field.streetHouseNumber` / `field.postalCodeCity` are split). New keys: `field.status`, `field.processType`, `field.statusGroup`, `field.released`, `field.releaseState`, `field.inClarification`, `param.reason`, `param.comment`, `param.businessPartner`, `action.*` (11), `log.*`, `request`, `requests`, `section.*`, `group.*`.
- `messages.properties`: `ACTION_DONE={0}: new status "{1}"` (toast); German `DRAFT_*` texts.
- The app bundle keeps only app-level texts (title, custom fragments, tooltips, FE text overrides).

## 5. FE application

Verified against SAPUI5 **1.148.12** FE V4 documentation and CDN sources. *V* = verified, *A* = assumed (covered by the spike, §8).

### 5.1 Files (`app/monitor` during migration, `app/monitor` after cutover)

| File | Purpose | ~lines |
|---|---|---|
| `webapp/Component.js` | `sap.fe.core.AppComponent` subclass, `manifest: "json"` | 8 |
| `webapp/manifest.json` | see 5.2 | 170 |
| `webapp/index.html` | unchanged CDN bootstrap (1.148.12, `sap_horizon`, `xx-component-preload=off`) | 25 |
| `webapp/ext/fragment/HintsColumn.fragment.xml` | icons `locked` / `question-mark` / `cart` bound to `released`, `inClarification`, `orderExists` | 25 |
| `webapp/ext/fragment/ClarificationStrip.fragment.xml` | `sap.m.MessageStrip type="Warning"` visible on `inClarification`, text with `clarificationComment` | 12 |
| `webapp/ext/controller/ObjectPageExt.controller.js` | `override.editFlow.onBeforeEdit` → `extensionAPI.refresh()` (editing always starts from fresh data); `onRefresh` for the custom header action "Aktualisieren" | 25 |
| `webapp/css/style.css`, `webapp/i18n/i18n*.properties` | icon spacing; `appTitle`, `list.col.hints`, tooltips, strip text, `common.refresh`, `C_OPERATIONS_ACTION_CONFIRM_MESSAGE\|Requests\|reset` | 5 + 2×15 |
| `webapp/test/integration/**` | `sap.fe.test` JourneyRunner, page objects, three journeys | 250 |
| `annotations.cds` | layout annotations (5.3) | ~250 |

Deleted at cutover: `controller/*`, `view/*`, `view/fragments/*`, `model/*`, `service/*`, `util/*`, `test/unit/**`, QUnit scripts.

### 5.2 manifest.json (essentials)

- `sap.ui5.dependencies.libs`: `sap.ui.core`, `sap.m`, `sap.f`, **`sap.fe.templates`** (pulls `sap.fe.core`, `sap.fe.macros`, `sap.ui.mdc`, `sap.ui.fl`, `sap.uxap`) *V*. `flexEnabled: true`.
- Default model: `dataSource mainService` (`/odata/v4/monitor/`, OData 4.0), `operationMode: Server`, `autoExpandSelect: true`, `earlyRequests: true`.
- `routing.config`: `routerClass: sap.f.routing.Router`, `flexibleColumnLayout.defaultTwoColumnLayoutType: TwoColumnsMidExpanded` *V*.
- Routes: `RequestsList` (`:?query:`, target `RequestsList`), `RequestsObjectPage` (`Requests({key}):?query:`, targets `RequestsList` + `RequestsObjectPage`) *V*.
- Target `RequestsList` = `sap.fe.templates.ListReport`, `controlAggregation: beginColumnPages`; settings `contextPath: /Requests`, `defaultTemplateAnnotationPath: com.sap.vocabularies.UI.v1.SelectionPresentationVariant#Default` *V*, `initialLoad: Enabled` *V*, `variantManagement: None`, `navigation.Requests.detail.route: RequestsObjectPage`; `controlConfiguration` for `@…LineItem`: `tableSettings { type: ResponsiveTable, selectionMode: None, personalization { column, sort }, popinLayout: GridSmall }` *V* and custom column `HintsColumn` (`template: hydac.custmon.ext.fragment.HintsColumn`, `properties: [released, inClarification, orderExists]`, `position { placement: After, anchor: DataField::status_code }`) *V*; `@…SelectionFields`: `filterFields.$editState.availability: Hidden`.
- Target `RequestsObjectPage` = `sap.fe.templates.ObjectPage`, `controlAggregation: midColumnPages`; settings `contextPath: /Requests`, `editableHeaderContent: false`, `showRelatedApps: false`; `content.header.facets.ClarificationStrip` (`template`, `position { Before, anchor: StatusPoint }`) *V*; `content.header.actions.Refresh` (`press: .extension.hydac.custmon.ext.controller.ObjectPageExt.onRefresh`, positioned after `DataFieldForActionGroup::Steps`) *V*; `controlConfiguration` for `log/@…LineItem`: `tableSettings { type: ResponsiveTable, selectionMode: None, personalization: false }`.
- `extends.extensions.sap.ui.controllerExtensions."sap.fe.templates.ObjectPage.ObjectPageController".controllerName: hydac.custmon.ext.controller.ObjectPageExt`.

### 5.3 Layout annotations (`app/monitor/annotations.cds`)

- **HeaderInfo**: `TypeName` / `TypeNamePlural` (`{i18n>request}` / `{i18n>requests}` → table title "Vorgänge (n)"), `Title: name`, `Description` = `odata.concat(processTypeRef/text, ' · ', magentoCompany)` (*V* secondary; fallback: backend `headerSubtitle`).
- **SelectionFields**: `statusGroup, released, inClarification, customer, salesOrganization, processType, status_code, source, orderExists, createdAt, createdBy, modifiedAt, modifiedBy`. Basic search is on by default *V*.
- **Default filter**: `UI.SelectionPresentationVariant#Default` → `UI.SelectionVariant#Default` (`SelectOptions` on `statusGroup` with ranges `EQ 'OPEN'`, `EQ 'ERROR'`) + `UI.PresentationVariant#Default` (`SortOrder createdAt` ascending, `Visualizations: ['@UI.LineItem']`). Multi-value defaults need this route; `Common.FilterDefaultValue` is single-value only *V*.
- **LineItem** (order as [04](04_ui_spezifikation.md) §2.2; `@UI.Importance #High` = never pop-in, `#Medium` = pop-in *V*): `status_code` (Criticality `statusCriticality`, `CriticalityRepresentation #WithIcon`, High) → custom column Hints → `processType` → `DataFieldForAnnotation → FieldGroup#Name` (`name`, `name2`, High) → `customer` → `salesOrganization` → `magentoCompany` → `orderVolume` (currency via `@Measures.ISOCurrency`) → `FieldGroup#Created` (`createdAt`, `createdBy`) → `FieldGroup#Changed`. FieldGroup columns are supported *V* (not sortable as a whole). Row highlight: `UI.LineItem.@UI.Criticality: orderCriticality` *V*.
- **Object Page header**: `UI.HeaderFacets` = `DataPoint#Status` (`status_code`, Criticality `statusCriticality`), `DataPoint#Release` (`releaseState`, Criticality `releaseCriticality`), `FieldGroup#KeyFigures` (`customer`, `businessPartner`, `salesOrganization`, `orderExists`, `orderVolume`), `FieldGroup#AdminData` (`createdBy/At`, `modifiedBy/At`) *V*. Klärung strip = custom header facet placed before `StatusPoint`.
- **Header actions**: `UI.Identification` with exactly one `UI.DataFieldForActionGroup` (`ID: Steps`, label "Schritt ausführen") containing the 11 `UI.DataFieldForAction`s in annotation order — **`rejectRequest` and `reset` last**. The group is disabled when all items are disabled and hidden when all are hidden *V*. `Criticality` on `DataFieldForAction` is not used (no effect inside a menu; as a button it would force left-most placement).
- **Facets**:
  - `CollectionFacet MainSection` ("Hauptdaten") with sub-groups Name / Adresse / Kommunikation / Steuer as `FieldGroup`s; `street` + `houseNumber` and `postalCode` + `city` as `UI.ConnectedFields` (*V* for tables, *A* for forms → S6; fallback one field per row).
  - `ReferenceFacet AdminSection` → `admin/@UI.FieldGroup#Admin`, `![@UI.Hidden]: { $edmJson: { $Eq: [{ $Path: 'processType' }, 'CR_WE'] } }` (edmJson on facets *V*).
  - `ReferenceFacet SalesSection` → `salesData/@UI.FieldGroup#Sales`.
  - `ReferenceFacet ShipToSection` → `shipTo/@UI.FieldGroup#ShipTo`, hidden unless CR_WE (`$Ne` *A* → S4; fallback `$Not { $Eq }`).
  - `CollectionFacet AssignmentSection` ("Zuordnung") with read-only groups SAP-Nummern / Magento / Freigabe.
  - `ReferenceFacet LogSection` → `log/@UI.PresentationVariant#Log` (`SortOrder line desc`; *A* → S7; fallback `log/@UI.LineItem` + backend order).
- **Compositions**: `annotate CustomerMonitorService.ContactPersons / SalesData / ShipToParties with @UI.FieldGroup#…` (fields as [04](04_ui_spezifikation.md) §3.3; read-only fields already `@readonly`). Facet targets through 1:1 navigation: *V* for DataPoints, *A* for editable FieldGroups on drafts (S5).
- **Log**: `annotate CustomerMonitorService.LogEntries with @UI.LineItem` (`messageType` with Criticality `criticality` `#WithIcon`, `createdAt`, `createdBy`, `step`, `messageText`, `fieldName` / `oldValue` / `newValue` with Importance Low).

### 5.4 What FE provides without own code (*V*)

| Topic | Behaviour |
|---|---|
| Editing | *Bearbeiten* → `draftEdit`; field changes PATCH the draft (and child drafts) immediately; *Sichern* → `draftActivate`; *Abbrechen* → discard popover; navigation with an unsaved draft → data-loss dialog (keep / discard / save); "locked by <user>" handling; Edit hidden via `UI.UpdateHidden` |
| Messages | one success message → toast; warnings or several messages → dialog; bound validation messages → footer message button + popover with field navigation; 503 / `retry-after` handling |
| Questions (CONFIRM_REQUIRED) | `Prefer: handling=strict` on every action → 412 + `Preference-Applied` → confirm dialog → re-invoke without the preference; plain 412 → error dialog |
| Side effects | `@Common.SideEffects` refreshes status, log, children and the FCL list row |
| FCL | full screen / exit / close, layout in the URL (`?layout=`) |
| Deep link | `#/Requests(ID=<guid>,IsActiveEntity=true)`; optional 8-line hash rewrite in `Component.js` for old `#/requests/<id>` bookmarks |

### 5.5 Tooling and tests

- `ui5.yaml` unchanged (no `framework` section; `cds-plugin-ui5` mounts `/monitor-fe`, after cutover `/monitor`).
- `ui5lint` and ESLint as today; manifest validation additionally via the UI5 MCP server (`run_manifest_validation`).
- QUnit is removed (no formatter, no filter builder, no step service left); `test:unit` script dropped.
- OPA5 with `sap.fe.test`: `JourneyRunner` with `ListReport({ appId: 'hydac.custmon', componentId: 'RequestsList', entitySet: 'Requests' })` and `ObjectPage({ … componentId: 'RequestsObjectPage' … })` *V*. Journeys: (1) list/filter (`onFilterBar().iChangeFilterField`, `iExecuteSearch`, `onTable().iCheckRows`), (2) deep link + draft edit + log (`onHeader().iExecuteEdit`, `onForm().iChangeField`, `onFooter().iExecuteSave`, `onTable({property:'log'})`), (3) step with strict-handling question (`onHeader().iExecuteMenuAction({ id: 'Steps' }, …)`, `onActionDialog()`, `onConfirmationDialog().iConfirm()`). Launch page: plain `index.html` (*A* → S10; fallback FLP sandbox page). `ui5-test-runner` scripts unchanged except the test page URL. The OPA profile runs with privileged `dummy` auth, so lock conflicts are covered by Jest, not OPA.

## 6. Migration plan

Branch `feature/fe-migration`. The FE app is built **side by side** in `app/monitor`; the freestyle app keeps working
through F-11 and F-13 … F-15 (additive backend changes) and breaks only with the draft change (F-12), which is scheduled
after the FE list and object page are usable. Cutover (F-21) renames `app/monitor` to `app/monitor` and deletes the
freestyle app. Each item is one change set with acceptance criteria in [06](06_backlog.md) (German). The spike (§8) runs on a
throwaway branch in parallel with F-11/F-12 and gates F-16.

| # | Change set | Area |
|---|---|---|
| F-11 | Contract: code lists, calculated fields, value helps (additive) | backend |
| F-12 | Draft editing (E-12): `@odata.draft.enabled`, `editHidden`, `log` association, EDIT/NEW guards, activation change log, timeouts, user `carol`, Jest draft tests | backend |
| F-13 | Per-step actions, `can*` flags, generic dispatcher, draft guards; `executeStep`/`availableSteps` removed; tests rewritten | backend |
| F-14 | Strict handling, messages (`notify`/`warn`, `target`), `ASSERT_MANDATORY`, `on('error')` | backend |
| F-15 | Labels and semantic annotations in the service (`srv/monitor-annotations.cds`, `_i18n`), CLAUDE.md rules note, E-13 | backend |
| F-16 | FE app skeleton + List Report (`app/monitor`) | frontend |
| F-17 | Object Page read-only (header, facets, process-type visibility, log, FCL) | frontend |
| F-18 | Steps as action group in the UI, "Aktualisieren", controller extension | frontend |
| F-19 | Draft editing in the UI (`onBeforeEdit` refresh, ConnectedFields, `$editState` hidden) | frontend |
| F-20 | OPA journeys with `sap.fe.test` | frontend |
| F-21 | Cutover: delete freestyle app, rename, docs 04/05/06/08, README, CLAUDE.md final | both |
| F-22 | Polish (column widths, pop-in, tooltips, empty states, keyboard, deep-link docs, draft-lock note) | frontend |
| B-06 | Phase 2: replication & delta sync (E-14) | backend |

Effort indication (one developer, excluding the S/4 side): backend F-11 … F-15 ≈ 5–7 days, frontend F-16 … F-20 ≈ 6–8 days,
spike 1–2 days, cutover + polish 2–3 days.

## 7. Phase 2: facade with replica (E-14)

CAP's generic mechanisms assume local rows: the ETag validation for bound actions (`validate_etag`) and lean draft's
EDIT lock (`SELECT … FOR UPDATE NOWAIT`) query `cds.db` directly. A pure pass-through facade without local data would
therefore fail on every `draftEdit` and every step action — independent of the draft decision. Hence E-14:

| Contract element | Facade behaviour |
|---|---|
| 11 bound actions | `ACTION_STEPS[event]` → S/4 `execute_function(guid, step, { text, businessPartner, force })`, `force = !strict`; an S/4 question is returned as the same 412 strict response; the returned record is upserted locally (S/4 version counter → `modifiedAt`) |
| `can*` flags | single read: `get_functions(guid)`; list: flags computed locally from the replicated `ZEC_CUST_PROCESS` customizing (same `sm.availableStepCodes`) or from an `AVAILABLE_STEPS` column of the S/4 list service |
| Draft editing | local draft tables; `draftEdit` lock and ETag on the replica; activation `before UPDATE` → S/4 `change_data` (+ change log), then the local UPDATE |
| `statusGroup`, `releaseState`, criticality, value helps | evaluated locally on the replica (no filter translation) |
| Synchronisation | delta pull on list read (changed since last sync via S/4 delta query or version counter) and after each S/4 call; full resync job; S/4 version conflict → 412 |

Requirements for the S/4 service (addition to [02](02_architektur.md) §6): delta read (changed-since), version counter per
request, `get_functions` / `execute_function` / `change_data` as remote functions without GUI popups.

## 8. Risks and spike

Throwaway branch `spike/fe-v4` (1–2 days) with the FE skeleton over the service at F-11/F-12 state. Results are recorded here
(§8.1) before F-16 starts; any assumed item that fails switches to its fallback.

| # | Verify | Pass criterion | Fallback |
|---|---|---|---|
| S1 | Manifest keys: anchors (`DataField::status_code`, `DataFieldForActionGroup::Steps`), nested CollectionFacet layout, `$editState` hiding, growing page size | LR + OP render; Hints after Status; editing-status filter hidden | read keys from DOM; accept FE page size |
| S2 | FE `$select`s `can*` / `editHidden` / `isEditable`; buttons disabled on actives with a foreign draft | network + UI check | — |
| S3 | `@UI.MultiLineText` + `MaxLength` + `@mandatory` in the parameter dialog | TextArea, counter, required | plain Input |
| S4 | `UI.Hidden` with `$Ne` on facets; `SelectionVariant#Default` with two ranges | ShipTo hidden for non-CR_WE; filter pre-filled | `$Not { $Eq }`; single default |
| S5 | Draft: edit `admin/firstName`, `salesData/division` through 1:1 facets, activate → one log entry per field, child ETags | PATCH on child draft ok; activation logs | flatten child fields into a custom section |
| S6 | `UI.ConnectedFields` in forms (display + edit) | two inputs in one row | one field per row |
| S7 | Facet target `log/@UI.PresentationVariant#Log` over the association | sorted `line desc` | `log/@UI.LineItem` + backend order |
| S8 | Service stopped / 500 on a step / 404 deep link | FE error dialog, no console exception | — |
| S9 | `ui5lint` + manifest validation | no errors | fix findings |
| S10 | `sap.fe.test` JourneyRunner on `index.html` under `ui5-test-runner` (+ Test Starter) | one journey green headless | FLP sandbox page |
| S11 | FCL deep link with / without `?layout=` | OP opens two-column; full screen updates the URL | document the pattern |
| S12 | Side effects after `release` in FCL: header and list row refresh (status text via association) | both refresh | absolute-path side effect for `/Requests` |
| S13 | Strict handling end-to-end in FE: confirm dialog with `details[]`, re-invoke, no duplicate toast; plain ETag 412 → error dialog | as described | custom action (not recommended) |
| S14 | Draft lock UX: second user presses Edit → "gesperrt von …"; expired lock takeover; `onBeforeEdit` refresh visible before `draftEdit`; per-action confirmation texts for `IsActionCritical` | as described | accept FE default texts |

Accepted limitations: no criticality styling inside the action menu (destructive steps last + confirmation); the draft
lock timeout (15 min) can block other editors — documented for users; draft indicators and the editing-status filter are
hidden via manifest; drafts are volatile in phase 1.

### 8.1 Spike results

_To be filled during F-11/F-12._

## 9. Documentation changes caused by this plan

| File | Change |
|---|---|
| `CLAUDE.md` | rule 1 → FE for OData V4 (`sap.fe.templates`), JS extensions only; rule 4 → labels in `_i18n`, app texts in webapp i18n; rule 5 → `can*` flags + `Core.OperationAvailable`; rule 6 → ETag on `draftEdit` / draft PATCH / actions + draft lock, strict handling; project paragraph; truth table row for this document. Interim note now, full rewrite with F-21. |
| [02](02_architektur.md) | §1 diagram (FE app), §2 phases (HANA Cloud from phase 2), E-02 decided for FE, E-04 rewritten, E-05 reworded, new E-12 / E-13 / E-14, §4 repository structure, §6 S/4 requirements |
| [03](03_service_vertrag.md) | §2/§3 draft keys, `log` association, VH entities, capabilities; §4 "Aktionsverfügbarkeit (`can*`)"; §5 "Aktionen je Schritt" + error table (412 strict, `ASSERT_MANDATORY`, `DRAFT_*`, `target`), §5.3 strict handling; §6 draft editing; §7 mock (Prefer semantics, draft tables in-memory); new §8 code lists / texts / criticality |
| [04](04_ui_spezifikation.md) | rewritten as FE specification (routes/FCL/deep link, filter fields + LineItem, header/facets, action group, draft editing, FE dialogs, FE messages, criticality from the service, scope) |
| [05](05_ui5_konventionen.md) | libraries (`sap.fe.templates`), structure (`ext/`, `annotations.cds`), models (FE-managed), rules (draft, no manual update groups), extension coding standards, i18n split, quality (QUnit removed, `sap.fe.test`), local development |
| [06](06_backlog.md) | F-10 closed/transferred; F-11 … F-22 and B-06 with acceptance criteria; B-03/B-04 reworded |
| [07](07_anforderungen_aus_altsystem.md), [08](08_demo_szenarien.md) | R-12/R-13/R-14 re-checked against FE behaviour; demo scenarios updated (filter fields, action menu, dialogs, draft lock with `carol`) |
| `README.md` | app URL, FE, deep-link format, runtime (HANA Cloud from phase 2) |

## 10. Glossary additions

| Term | Meaning |
|---|---|
| Draft | FE/CAP editing copy of a request (`IsActiveEntity = false`), owned and locked by one user until *Sichern* (activate) or *Abbrechen* (discard) |
| Strict handling | OData preference `handling=strict`; the server answers a business question with 412 + `Preference-Applied: handling=strict`, the client confirms by repeating the call without the preference |
| `can*` flag | virtual Boolean per step action, computed by the backend from customizing, status, release state and roles; bound to `Core.OperationAvailable` |
| Replica | local HANA copy of the request data in phase 2, kept in sync with S/4 (system of record) by write-through and delta pulls |
