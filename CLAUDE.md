# CLAUDE.md – Kundenmonitor BTP

Instructions for the coding assistant working in this repository. Read this file fully before any change.

## Project in one paragraph

We are rebuilding the SAP GUI report `ZEC_CUSTOMER_MONITOR` (HYDAC B2B shop: Magento → S/4HANA customer onboarding) as a BTP application: **SAP Fiori Elements for OData V4 (`sap.fe.templates`, JavaScript extensions only) + SAP CAP (Node.js) OData V4 service with draft** on SAP HANA Cloud. From phase 2 the CAP service is the **system of record** for the requests (decision E-15): Magento delivers registrations to it, the status machine and the steps run in CAP, notifications go back to Magento from CAP, and S/4HANA (on-premise and Public Cloud) is reached **only through the standard API `API_BUSINESS_PARTNER`** for business partner, customer, contact person and ship-to. No custom (Z) interfaces in S/4. The monitor shows incoming customer, contact-person and ship-to requests from Magento and lets back-office users review, edit, release, reject and process them step by step. The UI is annotation-driven: the service carries the UI semantics (`srv/monitor-annotations.cds`), the app only layout (`app/monitor/annotations.cds`) plus two fragments and one controller extension.

**Current phase: 1 – frontend against a CAP mock service** (phase 1b, the migration to Fiori Elements, is done — see `docs/09_migration_fiori_elements.md`). There is no S/4 connection yet. The CAP service persists test data (SQLite/in-memory) and simulates the status machine from the customizing CSVs; this mock logic becomes the production step logic in phase 2 (B-02). Do not add S/4 or Magento integration code unless a backlog item asks for it.

## Where the truth lives

| Topic | Source of truth |
|---|---|
| Business logic (process types, statuses, steps, release rules) | `docs/01_fachkonzept.md` |
| Entities, draft, actions per step, flags, error codes, code lists, mock behaviour | `docs/03_service_vertrag.md` |
| Screens, filters, columns, sections, actions, dialogs (as annotations) | `docs/04_ui_spezifikation.md` |
| Code style, folder layout, extensions, i18n, tests | `docs/05_ui5_konventionen.md` |
| What to build next + acceptance criteria | `docs/06_backlog.md` |
| Known legacy defects that the new solution must avoid | `docs/07_anforderungen_aus_altsystem.md` |
| Why Fiori Elements, draft, actions per step, phase-2 persistence in HANA (decisions D-1…D-15, E-12…E-15) | `docs/09_migration_fiori_elements.md` |
| Backend interfaces for phase 2 (E-15): Magento intake, steps → `API_BUSINESS_PARTNER`, notifications via outbox, destinations, what is retired in S/4 (B-01…B-08) | `docs/10_s4_schnittstelle.md` |
| Architecture, phases, decisions E-01…E-19, roles, deployment, operation | `docs/02_architektur.md` |
| Customer-facing solution design for HYDAC (EN, diagrams, AD-01…AD-14, risks) – derived from 02/10/11; update it when a decision changes | `docs/12_solution_design.md` |

If code and docs disagree, **stop and ask** instead of silently picking one. If a backlog item needs a decision that the docs don't cover, propose it and wait for confirmation.

## Hard rules

1. **Fiori Elements for OData V4, JavaScript.** List Report + Object Page from `sap.fe.templates`; own code only in `app/monitor/webapp/ext/` (XML fragments, controller extensions via `sap/ui/core/mvc/ControllerExtension` and the FE `ExtensionAPI`) — the single exception is the legacy-bookmark hash rewrite in `Component.js`, which must run before FE routing. No freestyle views/controllers, no TypeScript, no React/other frameworks, no `sap.ui.comp`, no `sap.ui.table`. Prefer an annotation or manifest setting over code; if something needs code, say why.
2. **OData V4 through Fiori Elements.** The model is configured in `manifest.json`; no manual `fetch`/`jQuery.ajax`, no own `bindContext`/`submitBatch` in extensions — use `editFlow`/`ExtensionAPI`. Actions are declared in CDS and rendered by FE.
3. **Async everywhere:** `sap.ui.define`, async manifest/views, no deprecated globals. Code must pass `ui5lint` (@ui5/linter) and ESLint without errors; CDS files must pass `cds lint` (@sap/eslint-plugin-cds) without warnings.
4. **All UI texts in i18n.** Field, action, section, column labels live in `_i18n/i18n.properties` (EN fallback) and `_i18n/i18n_de.properties` and reach the UI via `$metadata`; app-level texts (title, custom fragments, FE text overrides) in `app/monitor/webapp/i18n/i18n*.properties`. Status, step, process-type and release texts come from the service code lists, never from i18n.
5. **Backend decides what is allowed.** The service computes the `can*` flags and `isEditable`/`editHidden`; FE binds them via `Core.OperationAvailable` and `UI.UpdateHidden`. The UI never derives permissions from status/process type. Sections may be hidden by `processType` via `UI.Hidden` expressions as specified in docs/04.
6. **Concurrency and draft.** ETag on `draftEdit`, on draft PATCHes and on every step action; never disable ETag checks, never `If-Match: *` on actions. Editing uses CAP draft (lock while a draft exists; steps are blocked meanwhile). Backend questions use OData strict handling (412 + `Preference-Applied: handling=strict`), never a `force` parameter.
7. **No business logic in the frontend.** No formatters: criticality, texts and groups are data from the service (`statusCriticality`, `statusGroup`, `releaseState`, …).
8. **Mock service = contract.** The CAP mock must behave exactly as specified in `docs/03_service_vertrag.md` (including error codes and the annotations in `srv/monitor-annotations.cds`, E-13), so the UI does not change when HANA Cloud and the S/4 business-partner API are connected.
9. **Small, reviewable changes.** One backlog item per change set. Update the relevant doc in the same change if behaviour or contract changes.
10. **German domain terms stay German** in docs and UI texts (Debitor, Warenempfänger, Freigabe, Klärung). Code identifiers are English (see glossary in `docs/03_service_vertrag.md`).
11. **Commit directly on `main` and push** after each change set (project decision; no feature branches).

## Commands

```bash
npm install                 # root: CAP + workspaces
cds watch                   # service + UI at http://localhost:4004/monitor/index.html
npm run lint                # cds lint (CDS model) + ui5lint + eslint (app/monitor)
npm test                    # jest (srv) + OPA5 journeys with sap.fe.test (headless Chrome)
scripts/fe-console.sh "test/debug.html#/Requests(ID=…,IsActiveEntity=true)"   # console errors + screenshot, no browser window
```

`cds.test` and `ui5-test-runner` bind local ports; in a sandbox without port binding run them outside the sandbox.

## Definition of done (every change)

- Acceptance criteria of the backlog item are met and listed in the PR/commit message.
- `npm run lint` clean, `npm test` green, app starts with `cds watch` without console errors (known, accepted line: "S/CUBE is not yet supported", docs/05 §9).
- New UI texts exist in both language files (`_i18n/` for metadata labels, `webapp/i18n/` for app texts).
- Docs updated if contract, UI behaviour or decisions changed.

## Things to ask before doing

- Adding a new npm dependency or UI5 library.
- Changing the CDS service contract (entity/field/action names, error codes, contract annotations in `srv/monitor-annotations.cds`).
- Anything touching authentication, roles or deployment (`xs-security.json`, `mta.yaml`).
