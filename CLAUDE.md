# CLAUDE.md – Kundenmonitor BTP

Instructions for the coding assistant working in this repository. Read this file fully before any change.

## Project in one paragraph

We are rebuilding the SAP GUI report `ZEC_CUSTOMER_MONITOR` (HYDAC B2B shop: Magento → S/4HANA customer onboarding) as a BTP application: **freestyle SAPUI5 (JavaScript) + SAP CAP (Node.js) OData V4 service** acting as a facade to S/4HANA. The monitor shows incoming customer, contact-person and ship-to requests from Magento and lets back-office users review, edit, release, reject and process them step by step.

**Current phase: 1 – frontend against a CAP mock service.** There is no S/4 connection yet. The CAP service persists test data (SQLite/in-memory) and simulates the status machine from the customizing CSVs. Do not add S/4 integration code unless a backlog item asks for it.

## Where the truth lives

| Topic | Source of truth |
|---|---|
| Business logic (process types, statuses, steps, release rules) | `docs/01_fachkonzept.md` |
| Entities, actions, error codes, mock behaviour | `docs/03_service_vertrag.md` |
| Screens, fields, buttons, dialogs | `docs/04_ui_spezifikation.md` |
| Code style, folder layout, i18n, tests | `docs/05_ui5_konventionen.md` |
| What to build next + acceptance criteria | `docs/06_backlog.md` |
| Known legacy defects that the new solution must avoid | `docs/07_anforderungen_aus_altsystem.md` |

If code and docs disagree, **stop and ask** instead of silently picking one. If a backlog item needs a decision that the docs don't cover, propose it and wait for confirmation.

## Hard rules

1. **Freestyle UI5 in JavaScript.** No Fiori Elements, no TypeScript, no React/other frameworks. Use `sap.m`, `sap.f`, `sap.uxap`, `sap.ui.layout`. Do **not** use `sap.ui.comp` or `sap.ui.table` unless the UI spec says so.
2. **OData V4 model only** (`sap.ui.model.odata.v4.ODataModel`), configured in `manifest.json`. No manual `fetch`/`jQuery.ajax` to the service. Bound actions go through `oContext.getModel().bindContext(...)` / `ODataContextBinding#invoke`.
3. **Async everywhere:** `sap.ui.define`, `async: true` in manifest, no sync XHR, no deprecated globals (`jQuery.sap.*`, `sap.ui.getCore()` when a module API exists). Code must pass `ui5lint` (@ui5/linter) without errors.
4. **All UI texts in i18n** (`i18n.properties` = English fallback, `i18n_de.properties` German). No hard-coded user-visible strings in XML or JS. Status and step texts come from the service, not from i18n.
5. **Backend decides what is allowed.** The UI never computes which steps are permitted from status/process type; it calls `availableSteps()` and renders what comes back. The UI may hide/show sections by `processType` as described in the UI spec.
6. **Optimistic concurrency.** Every write (PATCH, `executeStep`) must send the ETag. Never disable ETag checks. Handle HTTP 412 as "record changed by someone else – reload".
7. **No business logic duplication in the frontend.** Formatters only map codes to UI states/icons.
8. **Mock service = contract.** The CAP mock must behave exactly as specified in `docs/03_service_vertrag.md` (including error codes), so the UI does not change when S/4 is connected.
9. **Small, reviewable changes.** One backlog item per change set. Update the relevant doc in the same change if behaviour or contract changes.
10. **German domain terms stay German** in docs and UI texts (Debitor, Warenempfänger, Freigabe, Klärung). Code identifiers are English (see glossary in `docs/03_service_vertrag.md`).

## Commands

```bash
npm install                 # root: CAP + workspaces
cds watch                   # service + UI at http://localhost:4004
npm run lint                # ui5lint + eslint
npm test                    # QUnit/OPA5 (app) + jest (srv)
```

## Definition of done (every change)

- Acceptance criteria of the backlog item are met and listed in the PR/commit message.
- `npm run lint` clean, `npm test` green, app starts with `cds watch` without console errors.
- New UI texts exist in both `i18n.properties` and `i18n_de.properties`.
- Docs updated if contract, UI behaviour or decisions changed.

## Things to ask before doing

- Adding a new npm dependency or UI5 library.
- Changing the CDS service contract (entity/field/action names, error codes).
- Anything touching authentication, roles or deployment (`xs-security.json`, `mta.yaml`).
