# Design: Worklist — the Kundenmonitor as a clerk's queue, not a report

Date: 2026-10-25 · Status: approved, implemented · Owner: Purplecat · Backlog: F-24 (service), F-25 (release reason), F-26 (UI)

## 1. Intent and why

The Fiori Elements migration delivered a faithful rebuild of the SAP GUI report `ZEC_CUSTOMER_MONITOR`: same filters, same columns, same steps. A faithful rebuild still makes the clerk **scan a list** to find out what needs doing. This design turns the List Report into the clerk's **worklist**: it answers "what needs me, what is stuck, what is oldest, what do I do next" before the clerk opens a single request.

Decided with the user on 2026-10-25:

- Where the app must feel better than the GUI report: **finding and prioritising work** (not single-request speed, not KPIs/dashboards, not under-the-hood changes).
- Team: **< 10 requests/day, 1–3 clerks, each owns a sales org**. The existing SalesOrg visibility filter already scopes every read, so "my work" needs no extra filter.
- Overdue: **no SLA**. Show the waiting time, let the clerk judge.
- Shape: **views in one list with counts**, two new columns (*Wartet seit*, *Nächster Schritt*), default sort errors → longest waiting, the recommended step repeated on the Object Page.
- Add-on from the technical review: **the release reason becomes visible** (why unreleased / how released). Backend optimisations and the F-23 visibility fix stay in the backlog (F-23 remains a blocker before any deployment beyond the local mock).

## 2. Goals, non-goals, anti-goals

**Goals**
1. On opening the app, a clerk sees only what they can act on, errors first, longest waiting next — without touching the filter bar.
2. Every situation that needs attention has a view with a live count: *Meine Arbeit*, *Fehler*, *Klärung*, *Freigabe*, *Alle*.
3. Every row says how long it has waited **in its current state** and which step the backend recommends.
4. The Object Page header repeats the recommended step; it refreshes after every step.
5. Releasers see **why** a request is unreleased (limit, no rule, …) and everybody sees how a request was released (credit card, under limit, manual).

**Non-goals** (this iteration)
- SLA/overdue markers, KPIs, charts, overview page, notifications, assignment/ownership, mass actions, Excel export, saved variants (needs the Work Zone flex service), BP value help (B-05), backend performance work, F-23.

**Anti-goals** (would make this a failure even if it "works")
- Any business rule in the UI (CLAUDE.md rules 5/7): the recommendation, the priority, the texts and the reason all come from the service.
- Custom UI code: the whole UI change is annotations + manifest.
- A 1:1 column dump: the new columns earn their place by answering a question; nothing else is added.

## 3. Constraints

- CLAUDE.md hard rules 1–11; contract changes are listed in §6 and approved with this design.
- UI5 1.148.12 Fiori Elements V4 features only (verified against the CDN sources in the design pass).
- EN + DE for every new text; status/step/reason texts are service code lists, never UI i18n.
- Commit per task on `main`, `npm run lint` 0 errors, Jest + OPA green, no new console errors.

## 4. The design

### 4.1 Views (D-7, D-13)

_Note: the absolute-path side-effect mechanism described below for refreshing the list after a step was replaced by D-14, the `editFlow.onAfterActionExecution` hook, because FE 1.148 has no absolute-path side effects._

| View | Filter | Who cares |
|---|---|---|
| Meine Arbeit (initial) | `statusGroup` in (OPEN, ERROR) | everyone |
| Fehler | `statusGroup` = ERROR | everyone |
| Klärung | `inClarification` = true and `statusGroup` in (OPEN, ERROR) | everyone — nothing ever clears the flag in phase 1 (S/4 owns that rule), so closed requests must not accumulate here |
| Freigabe | `released` = false and `statusGroup` = OPEN | releasers (others cannot see unreleased requests → count 0) |
| Alle | none | everyone |

- Rendered so that **every count is visible at once** (FE multi-table `views` → IconTabBar "Fehler (4)"). Fallback if that mode does not verify: single-table `quickVariantSelection` (dropdown when > 3 views).
- The view filter is ANDed with the filter bar; the filter bar no longer pre-fills `statusGroup` (the old `SelectionPresentationVariant#Default` and manifest `defaultTemplateAnnotationPath` are removed).
- Default sort (D-10): `priority` asc (ERROR 1, OPEN 2, REJECTED 3, DONE 4), then `waitingSince` asc. Row highlight: `rowCriticality` (ERROR → red, else order exists → blue; replaces `orderCriticality`).
- **After a step on the Object Page (FCL) the list must follow**: a repaired request leaves *Fehler*, a completed one leaves *Meine Arbeit*, and the counts change — without the clerk pressing Start. Mechanism: every step action's `Common.SideEffects` also targets the entity set by absolute path (`/CustomerMonitorService.EntityContainer/Requests`), which FE uses to refresh the list bindings; whether the tab counts refresh with it is verified in the plan for the chosen view mode. If counts cannot be refreshed by annotation, stale counts until the next Start/tab switch are an accepted, documented limit — no custom UI code for it (anti-goal).

### 4.2 Wartet seit (D-8)

- New stored `Requests.waitingSince : Timestamp` = moment of the last **state** change (status, inClarification or released). Set by the step dispatcher whenever a step result changes one of those; **not** changed by edits/draft activation or by a failed step that leaves the status unchanged. Demo data: `waitingSince = modifiedAt`.
- Service-computed `virtual waitingText : String(40)` in the request's language from `_i18n/messages*.properties` (`gerade eben`, `{0} min`, `{0} h`, `1 Tag`, `{0} Tage`), filled in the same after-READ handler as the `can*` flags; non-sortable, non-filterable, hidden filter. Sorting uses `waitingSince`.
- Known limit: the text is computed at read time with the server clock; the list does not tick (documented).

### 4.3 Nächster Schritt (D-9, W-1, W-2)

- `recommendedStep(request, processSteps, roles) → code | null` in the status machine: the first entry of the priority list `RELEASE, CREATE, CREATE_WE, AP_MODIFY, CHNG_OLD, CNG_DEBI, CNG_NEW` that is in `availableStepCodes(...)`. REJECT, MANUAL_OK, CLARIFY and RESET are never recommended.
- `virtual nextStep : StepCode`, `virtual nextStepText : String(60)` (localized step text). No recommendation (null/null) for: users without a recommendable step (viewers; unreleased request and the user cannot release — in phase 1 only releasers can see unreleased requests anyway, so no "Wartet auf Freigabe" text is needed), DONE/REJECTED, drafts and locked rows.
- Shown as a list column and as `UI.DataPoint #NextStep` in the Object Page header; every step's `Common.SideEffects` refreshes it. The recommended entry is **not** emphasised inside the step menu: FE 1.148 applies `Criticality` only to stand-alone header buttons, not to `DataFieldForActionGroup` items (verified).

### 4.4 Release reason (D-11)

- Stored `Requests.releaseReason : String(20)` + `releaseLimit : Decimal(15,2)` (the limit the rule applied, null when the rule has none; currency = request currency, customizing is EUR-only) + code list `ReleaseReasons` (EN/DE texts). Set by the status machine's release check (`{ released, releaseProcedure, releaseReason, releaseLimit }`), by a manual release (`MANUAL`, limit untouched) and by the CNG_NEW re-check. Nine codes, one per branch of docs/01 §4: `ALWAYS` (CH_AP), `NO_RULE`, `NOT_REQUIRED`, `CREDIT_CARD`, `UNDER_LIMIT`, `OVER_LIMIT` (limit set and exceeded), `NO_VOLUME` (limit set, no credit card, volume 0), `MANUAL_REQUIRED` (rule without limit/credit-card match, e.g. VKORG 7050), `MANUAL`.
- Shown with `Common.Text` in the Zuordnung → Freigabe group on the Object Page ("Grund", "Freigabelimit") and as a list column after Status/Hinweise; included in all step side effects.

### 4.5 Texts

Metadata labels and view names in `_i18n/i18n*.properties` (service bundle, reaches the UI via `$metadata`); relative-time and "Wartet auf Freigabe" in `_i18n/messages*.properties`; nothing new in the app bundle.

## 5. What is left to the builder

- Exact bucket boundaries of the relative-time text (plan proposes floor minutes/hours/days; "1 Tag" singular key).
- Column widths and importance so the one-column layout still fits at 1,500 px (docs/04 §2.2 sum).
- The per-row demo values of `releaseReason` (derivable from `released`/`releaseProcedure`/`orderVolume`/`creditCardPayment`).
- OPA assertions' exact FE page-object calls (tab switching, data point).

## 6. Contract changes (approved with this design; docs/03 updated in the same commits)

1. `Requests.waitingSince` (stored, `@readonly`), `waitingText` (virtual).
2. `Requests.nextStep`, `nextStepText` (virtual).
3. `Requests.priority`, `rowCriticality` (calculated); `orderCriticality` removed.
4. `Requests.releaseReason`, `releaseLimit` (stored) + `releaseReasonRef` + code list `ReleaseReasons`.
5. `Capabilities.SortRestrictions/FilterRestrictions` for the virtual texts; all 11 step side effects extended (new properties + absolute-path `TargetEntities` for the list refresh).
6. New service texts `WAITING_*`.

## 7. Decision log (continues docs/09)

D-7 views in one list · D-8 waiting since state change · D-9 backend recommendation · D-10 priority sort + row criticality · D-11 release reason as data · D-12 execution with Opus subagents on `main` · D-13 counts visible at once (IconTabBar), dropdown as fallback.
