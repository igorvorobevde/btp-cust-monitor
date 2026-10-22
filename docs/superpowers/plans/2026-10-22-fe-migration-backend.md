# FE Migration – Backend Contract (F-11 … F-15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the CAP mock service into the Fiori-Elements-ready contract described in `docs/09_migration_fiori_elements.md` §4: code lists and calculated fields, draft-enabled `Requests`, one bound action per step with `can*` flags, strict handling, and service-side labels — with the Jest suite green after every task.

**Architecture:** CDS additions in `db/schema.cds` and `srv/monitor-service.cds`, a new contract-annotation file `srv/monitor-annotations.cds`, handler changes in `srv/monitor-service.js` (after-READ flags, generic action dispatcher, EDIT guard, activation change log, strict handling). `srv/lib/status-machine.js` is not touched. Each task is one backlog item (F-11 split in three) and one commit on `main`.

**Tech Stack:** CAP Node.js (`@sap/cds` 9.9.3, lean draft, SQLite in-memory), Jest 30 with `@cap-js/cds-test`, CSV seed data, `_i18n` bundles.

**Spec:** `docs/09_migration_fiori_elements.md` (§4 backend, §8 risks), backlog `docs/06_backlog.md` F-11 … F-15, contract `docs/03_service_vertrag.md` (to be updated per task).

## Global Constraints

- Commit directly on `main` and push after each task (project rule).
- `npm run test:srv` green after every task; `npx cds compile srv --to edmx` without errors.
- `srv/lib/status-machine.js` and `test/status-machine.test.js` stay unchanged.
- Existing CSV rows in `hydac.custmon-Requests.csv`, child CSVs, `LogEntries.csv`, `Steps.csv` are not changed (only `Statuses.csv` gets a column; new CSVs are added).
- Error texts in `_i18n/messages.properties` (EN) **and** `_i18n/messages_de.properties` (DE); labels in `_i18n/i18n.properties` (EN) **and** `_i18n/i18n_de.properties`.
- German domain terms stay German in texts; identifiers English, camelCase.
- `If-Match: *` is never accepted as a valid ETag on actions (contract 03 §3).
- Jest runs the server in-process on a random port: if the sandbox blocks port binding (EPERM), run the test command outside the sandbox or enable `sandbox.network.allowLocalBinding`.

## Review Focus

1. **Action on an active request while another user holds a draft** – must be rejected (`409 DRAFT_ALREADY_EXISTS`), never silently change data under the draft. → Task 5 test "action on active with foreign draft".
2. **`If-Match: *` on a step action** – must be rejected with 412, not treated as a match. → Task 5 test "If-Match * on action → 412".
3. **Activation with an unchanged child payload** – no log entries for fields whose value did not change (`null` vs `""` are equal). → Task 4 test "activation logs only changed fields".
4. **Strict-handling header on the ETag-412 path** – a stale ETag with `Prefer: handling=strict` must answer 412 **without** `Preference-Applied`, otherwise FE shows a confirm dialog for a conflict. → Task 6 test "stale ETag with Prefer → plain 412".
5. **`$select` without flag inputs** – `GET /Requests?$select=name` must still return correct `can*` values (inputs re-selected), never `null`. → Task 5 test "flags with narrow $select".

---

### Task 1: Code lists with criticality (F-11a)

**Files:**
- Modify: `db/schema.cds` (entity `Statuses`, new entities `StatusGroups`, `ReleaseStates`)
- Modify: `srv/monitor-service.cds` (expose `StatusGroups`, `ReleaseStates` `@readonly`)
- Modify: `db/data/hydac.custmon-Statuses.csv` (new column `criticality`)
- Create: `db/data/hydac.custmon-StatusGroups.csv`, `db/data/hydac.custmon-StatusGroups_texts.csv`, `db/data/hydac.custmon-ReleaseStates.csv`, `db/data/hydac.custmon-ReleaseStates_texts.csv`
- Test: `test/monitor-service.test.js` (new describe `F-11 code lists`)

**Interfaces:**
- Produces: `db.Statuses.criticality : Integer`; entities `db.StatusGroups { key code : String(10); text : localized String(60) }` with rows OPEN/ERROR/REJECTED/DONE; `db.ReleaseStates { key code : String(12); text : localized String(60) }` with rows NOT_RELEASED/NOT_REL/AUTOMATIC/MANUAL; service entities `CustomerMonitorService.StatusGroups`, `.ReleaseStates`.

- [ ] **Step 1: Write the failing tests**

```js
describe("F-11 code lists", () => {
	test("Statuses carry criticality", async () => {
		expect((await GET(`${BASE}/Statuses('000')`, ALICE)).data.criticality).toBe(5);
		expect((await GET(`${BASE}/Statuses('140')`, ALICE)).data.criticality).toBe(1);
		expect((await GET(`${BASE}/Statuses('899')`, ALICE)).data.criticality).toBe(0);
		expect((await GET(`${BASE}/Statuses('999')`, ALICE)).data.criticality).toBe(3);
	});
	test("StatusGroups and ReleaseStates are localized code lists", async () => {
		const de = { ...ALICE, headers: { "Accept-Language": "de" } };
		expect((await GET(`${BASE}/StatusGroups`, ALICE)).data.value.map((g) => g.code).sort()).toEqual(["DONE", "ERROR", "OPEN", "REJECTED"]);
		expect((await GET(`${BASE}/StatusGroups('OPEN')`, de)).data.text).toBe("Offen");
		expect((await GET(`${BASE}/ReleaseStates('MANUAL')`, de)).data.text).toBe("Freigegeben (manuell)");
		expect((await GET(`${BASE}/ReleaseStates('NOT_RELEASED')`, ALICE)).data.text).toBe("Not released");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-11 code lists"`
Expected: FAIL (404 on `/StatusGroups`, `criticality` undefined)

- [ ] **Step 3: Add the entities and CSVs**

`db/schema.cds`: add `criticality : Integer;` to `Statuses`; add
```cds
entity StatusGroups  { key code : String(10); text : localized String(60); }   // OPEN | ERROR | REJECTED | DONE
entity ReleaseStates { key code : String(12); text : localized String(60); }   // NOT_RELEASED | NOT_REL | AUTOMATIC | MANUAL
```
`srv/monitor-service.cds`: `@readonly entity StatusGroups as projection on db.StatusGroups;` and the same for `ReleaseStates`.
CSV (`;`-separated like the existing files): `Statuses.csv` gets `criticality` = 5 for 000/010/110/120/130, 1 for 140/150/160, 0 for 899, 3 for 997/998/999. `StatusGroups.csv` `code;text`: OPEN;Open · ERROR;Error · REJECTED;Rejected · DONE;Completed. `StatusGroups_texts.csv` `locale;code;text`: de → Offen / Fehler / Abgelehnt / Erledigt, en → same as base. `ReleaseStates.csv`: NOT_RELEASED;Not released · NOT_REL;Released (not required) · AUTOMATIC;Released (automatic) · MANUAL;Released (manual). `ReleaseStates_texts.csv` de: Nicht freigegeben / Freigegeben (nicht erforderlich) / Freigegeben (automatisch) / Freigegeben (manuell); en rows as base.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS (existing 47 + 2 new)

- [ ] **Step 5: Update docs and commit**

`docs/03_service_vertrag.md` §2: add `Statuses.criticality`, entities `StatusGroups`, `ReleaseStates` to the entity list (one row each).

```bash
git add db srv/monitor-service.cds test docs/03_service_vertrag.md
git commit -m "feat(F-11a): code lists StatusGroups/ReleaseStates and status criticality"
git push
```

---

### Task 2: Calculated fields and code-list navigation on Requests (F-11b)

**Files:**
- Modify: `db/schema.cds` (entity `Requests`, entity `LogEntries`)
- Modify: `srv/monitor-service.cds` (`@readonly` for the new elements)
- Modify: `srv/monitor-service.js:15` (`TECHNICAL_FIELDS`)
- Test: `test/monitor-service.test.js` (describe `F-11 calculated fields`)

**Interfaces:**
- Produces on `Requests`: `processTypeRef` (assoc → `ProcessTypes`), `releaseStateRef` (assoc → `ReleaseStates`), `statusGroup : String(10)`, `statusCriticality : Integer`, `orderCriticality : Integer`, `releaseCriticality : Integer`, `releaseState : String(12)` (stored); on `LogEntries`: `criticality : Integer`. All read-only in the service.

- [ ] **Step 1: Write the failing tests**

```js
describe("F-11 calculated fields", () => {
	test("statusGroup / statusCriticality follow the status and are filterable and sortable", async () => {
		const { data } = await GET(`${BASE}/Requests?$filter=statusGroup eq 'ERROR'&$orderby=statusCriticality desc&$select=status_code,statusGroup,statusCriticality`, ALICE);
		expect(data.value.length).toBeGreaterThan(0);
		expect(data.value.every((r) => ["140", "150", "160"].includes(r.status_code) && r.statusCriticality === 1)).toBe(true);
		const open = await GET(`${BASE}/Requests?$filter=statusGroup eq 'OPEN' or statusGroup eq 'ERROR'&$count=true&$top=0`, ALICE);
		expect(open.data["@odata.count"]).toBe(18);
	});
	test("releaseState is derived from released + releaseProcedure", async () => {
		const state = async (n) => (await GET(url(n, "?$select=releaseState,releaseCriticality"), ALICE)).data;
		expect(await state(1)).toMatchObject({ releaseState: "NOT_REL", releaseCriticality: 3 });
		expect(await state(2)).toMatchObject({ releaseState: "NOT_RELEASED", releaseCriticality: 2 });
		expect(await state(3)).toMatchObject({ releaseState: "AUTOMATIC", releaseCriticality: 3 });
	});
	test("processTypeRef and releaseStateRef expand with localized texts", async () => {
		const { data } = await GET(url(1, "?$select=processType&$expand=processTypeRef($select=text),releaseStateRef($select=text)"), { ...ALICE, headers: { "Accept-Language": "de" } });
		expect(data.processTypeRef.text).toBe("Neuer Debitor");
		expect(data.releaseStateRef.text).toBe("Freigegeben (nicht erforderlich)");
	});
	test("orderCriticality and log criticality", async () => {
		expect((await GET(url(2, "?$select=orderCriticality"), ALICE)).data.orderCriticality).toBe(5);
		expect((await GET(url(1, "?$select=orderCriticality"), ALICE)).data.orderCriticality).toBe(0);
		const { data } = await GET(url(1, "/log?$select=messageType,criticality&$top=1"), ALICE);
		expect(data.value[0]).toMatchObject({ messageType: "S", criticality: 3 });
	});
});
```
(The DE text of `ProcessTypes('CR_DEB')` is read from `db/data/hydac.custmon-ProcessTypes_texts.csv`; adjust the literal if it differs.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-11 calculated fields"`
Expected: FAIL (unknown properties)

- [ ] **Step 3: Add the elements**

`db/schema.cds`, entity `Requests` (after the compositions, before `virtual isEditable`):
```cds
processTypeRef     : Association to ProcessTypes  on processTypeRef.code  = processType;
releaseStateRef    : Association to ReleaseStates on releaseStateRef.code = releaseState;
statusGroup        : String(10) = status.group;
statusCriticality  : Integer    = status.criticality;
orderCriticality   : Integer    = case when orderExists = true then 5 else 0 end;
releaseCriticality : Integer    = case when released = true then 3 else 2 end;
releaseState       : String(12) = (case when released = true then releaseProcedure else 'NOT_RELEASED' end) stored;
```
`LogEntries`: `criticality : Integer = case when messageType = 'S' then 3 when messageType = 'W' then 2 when messageType = 'E' then 1 when messageType = 'A' then 1 when messageType = 'I' then 5 else 0 end;`
`srv/monitor-service.cds` (read-only block): `statusGroup @readonly; statusCriticality @readonly; orderCriticality @readonly; releaseCriticality @readonly; releaseState @readonly;`.
`srv/monitor-service.js`: add `"releaseState"`, `"statusGroup"`, `"statusCriticality"`, `"orderCriticality"`, `"releaseCriticality"` to `TECHNICAL_FIELDS` so they are never logged as field changes.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS. If `$filter` on `statusGroup` fails on SQLite, check that the association path is written `status.group` (not `status_code`) and that `cds compile srv --to sql` shows the join.

- [ ] **Step 5: Update docs and commit**

`docs/03_service_vertrag.md` §2 `Requests`: add the seven elements with one line each ("berechnet, read-only"); new §8 "Codelisten, Texte, Kritikalität" with the criticality table (5 Information, 1 Error, 0 None, 3 Success) and the `releaseState` rule.

```bash
git add db srv test docs/03_service_vertrag.md
git commit -m "feat(F-11b): calculated statusGroup/criticality/releaseState and code-list navigation"
git push
```

---

### Task 3: Value-help views (F-11c)

**Files:**
- Modify: `srv/monitor-service.cds` (entities `SalesOrganizations`, `Sources`)
- Test: `test/monitor-service.test.js` (describe `F-11 value helps`)

**Interfaces:**
- Produces: `CustomerMonitorService.SalesOrganizations { key salesOrganization : String(4) }` restricted to the user's `SalesOrg`; `CustomerMonitorService.Sources { key source : String(10) }`.

- [ ] **Step 1: Write the failing tests**

```js
describe("F-11 value helps", () => {
	test("SalesOrganizations are distinct and restricted to the user's VKORG", async () => {
		expect((await GET(`${BASE}/SalesOrganizations`, ALICE)).data.value.map((v) => v.salesOrganization).sort()).toEqual(["0001", "2000", "7050"]);
		expect((await GET(`${BASE}/SalesOrganizations`, BOB)).data.value.map((v) => v.salesOrganization)).toEqual(["0001"]);
	});
	test("Sources are distinct", async () => {
		expect((await GET(`${BASE}/Sources`, ALICE)).data.value.map((v) => v.source)).toEqual(["SHOP"]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-11 value helps"`
Expected: FAIL (404)

- [ ] **Step 3: Add the views**

`srv/monitor-service.cds` inside the service:
```cds
@readonly @cds.redirection.target: false
@restrict: [{ grant: 'READ', to: 'MonitorViewer', where: 'salesOrganization = $user.SalesOrg' }]
entity SalesOrganizations as select from db.Requests distinct { key salesOrganization };

@readonly @cds.redirection.target: false
entity Sources as select from db.Requests distinct { key source };
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS

- [ ] **Step 5: Update docs and commit**

`docs/03_service_vertrag.md` §3: add both views (purpose: Wertehilfe, nur Codes, VKORG-Einschränkung für `SalesOrganizations`).

```bash
git add srv/monitor-service.cds test docs/03_service_vertrag.md
git commit -m "feat(F-11c): value-help views SalesOrganizations and Sources"
git push
```

---

### Task 4: Draft-enabled Requests (F-12)

**Files:**
- Modify: `db/schema.cds:85-88` (`log` becomes association; `virtual editHidden`)
- Modify: `srv/monitor-service.cds` (entity `Requests`: `@odata.draft.enabled`, `@UI.UpdateHidden: editHidden`; `editHidden @Core.Computed`)
- Modify: `srv/monitor-service.js:36-55, 155-229` (remove `parseETag`/`sameETag` usage in UPDATE, `before EDIT`, `before NEW`, activation change log, flags on drafts)
- Modify: `.cdsrc.json` (user `carol`; `fiori` timeouts)
- Modify: `_i18n/messages.properties`, `_i18n/messages_de.properties` (`DRAFT_*`, `ENTITY_LOCKED`)
- Modify: `test/monitor-service.test.js` (helpers `url`, `edit`, `patchDraft`, `activate`; replace the two PATCH-based describes)

**Interfaces:**
- Consumes: Task 2 fields.
- Produces: OData keys `Requests(ID=<uuid>,IsActiveEntity=true|false)`; actions `draftEdit` (needs `If-Match` of the active), `draftActivate` (needs `If-Match` of the draft); `virtual editHidden : Boolean` (= `!isEditable`); errors `409 NOT_EDITABLE` on `draftEdit`, `405` on `POST /Requests`, `409 DRAFT_ALREADY_EXISTS`, `403 DRAFT_LOCKED_BY_ANOTHER_USER` (CAP codes). Test helpers used by Task 5/6:
  - `url(n, path = "", active = true)` → `${BASE}/Requests(ID=${id(n)},IsActiveEntity=${active})${path}`
  - `edit(n, user = ALICE)` → `POST url(n, "/CustomerMonitorService.draftEdit")` with `{ PreserveChanges: true }` and `If-Match: await etag(n, user)`; returns the axios response
  - `draftEtag(n, path = "", user = ALICE)` → `@odata.etag` of `GET url(n, path + "?$select=modifiedAt", false)`
  - `patchDraft(n, path, body, user = ALICE)` → `PATCH url(n, path, false)` with `If-Match: await draftEtag(n, path, user)`
  - `activate(n, user = ALICE)` → `POST url(n, "/CustomerMonitorService.draftActivate", false)` with `If-Match: await draftEtag(n, "", user)`
  - `CAROL = { auth: { username: "carol", password: "carol" } }`

- [ ] **Step 1: Rewrite the helpers and write the failing tests**

Change `url` to the composite-key form above (all existing tests go through it). Delete the describe `Optimistic concurrency (412)` test "PATCH without ETag → 412; child change bumps parent ETag" and the describe `Editing (03 §6)`. Add:

```js
describe("F-12 draft editing", () => {
	test("$metadata declares the draft root without a log draft", async () => {
		const { data } = await GET(`${BASE}/$metadata`, ALICE);
		expect(data).toMatch(/Common.DraftRoot/);
		expect(data).toMatch(/Name="IsActiveEntity"/);
		expect(data).not.toMatch(/LogEntries_drafts/);
	});
	test("edit → patch root and child → activate writes one log entry per changed field", async () => {
		const before = await etag(6);
		expect((await edit(6)).status).toBe(201);
		await patchDraft(6, "", { name: "Neu GmbH", city: "Bonn" });
		await patchDraft(6, "/salesData", { salesGroup: "999" });
		const { status, data } = await activate(6);
		expect(status).toBe(200);
		expect(data).toMatchObject({ name: "Neu GmbH", IsActiveEntity: true });
		expect(await etag(6)).not.toBe(before);
		const { data: log } = await GET(url(6, "/log?$orderby=line desc&$top=3"), ALICE);
		expect(log.value.map((l) => l.fieldName).sort()).toEqual(["city", "name", "salesData.salesGroup"]);
		expect(log.value.find((l) => l.fieldName === "name")).toMatchObject({ oldValue: "Bauer Filtertechnik GmbH", newValue: "Neu GmbH" });
		expect((await failure(GET(url(6, "", false), ALICE))).status).toBe(404);
	});
	test("activation logs only changed fields", async () => {
		await edit(6);
		await patchDraft(6, "", { name2: null });
		const { data: before } = await GET(url(6, "/log?$count=true&$top=0"), ALICE);
		await activate(6);
		const { data: after } = await GET(url(6, "/log?$count=true&$top=0"), ALICE);
		expect(after["@odata.count"]).toBe(before["@odata.count"]);
	});
	test("edit guards: closed request, missing ETag, viewer, create", async () => {
		const closed = await failure(edit(12));
		expect(closed.status).toBe(409);
		expect(closed.data.error.code).toBe("NOT_EDITABLE");
		expect((await failure(POST(url(6, "/CustomerMonitorService.draftEdit"), { PreserveChanges: true }, ALICE))).status).toBe(412);
		expect((await failure(edit(6, BOB))).status).toBe(403);
		expect((await failure(POST(`${BASE}/Requests`, {}, ALICE))).status).toBe(405);
	});
	test("draft lock: second editor cannot edit, patch or activate", async () => {
		await edit(6);
		const locked = await failure(edit(6, CAROL));
		expect(locked.status).toBe(409);
		expect(locked.data.error.code).toBe("DRAFT_ALREADY_EXISTS");
		expect((await failure(PATCH(url(6, "", false), { name: "X" }, { ...CAROL, headers: { "If-Match": "*" } }))).status).toBe(403);
	});
	test("editHidden mirrors isEditable", async () => {
		expect((await GET(url(6, "?$select=isEditable,editHidden"), ALICE)).data).toMatchObject({ isEditable: true, editHidden: false });
		expect((await GET(url(12, "?$select=isEditable,editHidden"), ALICE)).data).toMatchObject({ isEditable: false, editHidden: true });
		expect((await GET(url(6, "?$select=isEditable,editHidden"), BOB)).data).toMatchObject({ isEditable: false, editHidden: true });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-12"`
Expected: FAIL (no `draftEdit`, keys not accepted)

- [ ] **Step 3: Enable draft in CDS and config**

`db/schema.cds`: `log : Association to many LogEntries on log.request = $self;` (was Composition); add `virtual editHidden : Boolean;` next to `isEditable`.
`srv/monitor-service.cds`, entity `Requests`: add `@odata.draft.enabled` and `@UI.UpdateHidden: editHidden` to the annotations; `editHidden @Core.Computed;` in the read-only block.
`.cdsrc.json`: add top-level `"fiori": { "draft_lock_timeout": "15min", "draft_deletion_timeout": "7d" }` and user `carol` (`password: "carol"`, roles `MonitorViewer`, `MonitorEditor`, attr `SalesOrg: ["0001","2000","7050"]`).
`_i18n/messages_de.properties`: `DRAFT_ALREADY_EXISTS=Der Vorgang wird bereits von einem anderen Benutzer bearbeitet.`, `DRAFT_LOCKED_BY_ANOTHER_USER=Der Entwurf ist durch einen anderen Benutzer gesperrt.`, `DRAFT_NOT_EXISTING=Der Entwurf existiert nicht mehr.`, `ENTITY_LOCKED=Der Vorgang ist gesperrt.`; EN equivalents in `messages.properties`.

- [ ] **Step 4: Rework the handlers in `srv/monitor-service.js`**

1. Delete `parseETag`/`sameETag` usage from `before UPDATE`; keep both functions (the action handler still uses `sameETag` until Task 5).
2. `this.before("CREATE", …)`/`"DELETE"` guard stays; add `this.before("NEW", Requests.drafts, (req) => req.reject(405, t(req, "METHOD_NOT_ALLOWED")));`.
3. Add `this.before("EDIT", Requests, async (req) => { const request = await loadRequest(req, lastKey(req)); if (!sm.isEditable(request, roles(req).isEditor)) req.reject({ status: 409, code: ErrorCodes.NOT_EDITABLE, message: t(req, "NOT_EDITABLE") }); });`
4. Replace `this.before("UPDATE", [Requests, ...editableChildren], …)` by `this.before("UPDATE", Requests, …)` (activation or programmatic): load `old` deep (`r`.*`; r.salesData(s=>s`.*`); r.admin(a=>a`.*`); r.shipTo(s=>s`.*`)`) by `req.data.ID ?? lastKey(req)`; 404 if missing; `409 NOT_EDITABLE` if `!sm.isEditable(old, isEditor)`; compute `changes = diff("", old, req.data, Requests) ∪ diff("salesData.", old.salesData, req.data.salesData, SalesData) ∪ diff("admin.", …, ContactPersons) ∪ diff("shipTo.", …, ShipToParties)` where `diff(prefix, oldRow, newRow, entity)` returns `{ fieldName, oldValue, newValue }` for keys of `newRow` that are elements of `entity`, not associations, not `@readonly`, not in `TECHNICAL_FIELDS`, and whose `(old ?? null) !== (new ?? null)`; reject `409 NOT_EDITABLE` if a change starts with `admin.` for `CR_WE` or with `shipTo.` for other process types; `writeLog` the changes as today (messageType S, number 040, `LOG_FIELD_CHANGED`). Remove the `req.before("commit", …)` parent-ETag bump.
5. `TECHNICAL_FIELDS`: add `"IsActiveEntity"`, `"HasActiveEntity"`, `"HasDraftEntity"`, `"DraftAdministrativeData_DraftUUID"`, `"editHidden"`.
6. `after READ`: register on `[Requests, Requests.drafts]`; `const draft = !!req.target.isDraft;` for drafts set `row.isEditable = true`; for actives as today; always `row.editHidden = !row.isEditable`. (Flags for steps come in Task 5.)

- [ ] **Step 5: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS. Known adjustments: the existing `CREATE and DELETE … 405` test keeps passing via `before NEW`; the `executeStep` tests keep passing because `url()` now sends the composite key.

- [ ] **Step 6: Update docs and commit**

`docs/03_service_vertrag.md` §3 (Draft-Keys, `draftEdit`/`draftActivate`, `log` Assoziation, `editHidden`), §6 "Bearbeiten" rewritten for draft (lock, timeouts, activation log), §5.1 error table (+ `DRAFT_ALREADY_EXISTS` 409, `DRAFT_LOCKED_BY_ANOTHER_USER` 403, `NOT_EDITABLE` on `draftEdit`), §7 (drafts in-memory in phase 1).

```bash
git add db srv .cdsrc.json _i18n test docs/03_service_vertrag.md
git commit -m "feat(F-12): draft-enabled Requests with EDIT guard and activation change log"
git push
```

---

### Task 5: Per-step bound actions, `can*` flags, generic dispatcher (F-13)

**Files:**
- Modify: `db/schema.cds` (11 `virtual can* : Boolean` on `Requests`)
- Modify: `srv/monitor-service.cds` (actions, `@restrict`, `@Core.OperationAvailable`, `@Common.SideEffects`, `@Core.Computed` for flags; remove `availableSteps`, `executeStep`, `StepOption`)
- Modify: `srv/monitor-service.js` (constants `STEP_ACTIONS`, `ACTION_STEPS`, `PARAMS`, `FLAG_INPUT`; `setFlags`; `after READ`; generic `on` handler; delete `availableSteps`/`executeStep` handlers)
- Modify: `test/monitor-service.test.js` (helpers `invoke`, `flags`; all describes that used `executeStep`/`stepCodes`)

**Interfaces:**
- Consumes: Task 4 helpers and draft semantics.
- Produces: bound actions on `Requests` (`in : $self`), all `returns Requests`: `release()`, `rejectRequest(reason : String(100))`, `clarify(comment : String(100))`, `reset()`, `createCustomer()`, `createShipTo()`, `modifyContact()`, `convertToNewCustomer()`, `completeManually()`, `assignExistingCustomer(businessPartner : String(10))`, `changeCustomerAssignment(businessPartner : String(10))`; parameters `@mandatory @title` (`reason`/`comment` also `@UI.MultiLineText`). Flags `canRelease, canReject, canClarify, canReset, canCreateCustomer, canCreateShipTo, canModifyContact, canConvertToNewCustomer, canCompleteManually, canAssignExistingCustomer, canChangeCustomerAssignment`. JS constants:
  - `STEP_ACTIONS = { RELEASE: "release", REJECT: "rejectRequest", CLARIFY: "clarify", RESET: "reset", CREATE: "createCustomer", CREATE_WE: "createShipTo", AP_MODIFY: "modifyContact", CNG_NEW: "convertToNewCustomer", MANUAL_OK: "completeManually", CHNG_OLD: "assignExistingCustomer", CNG_DEBI: "changeCustomerAssignment" }`
  - `PARAMS = { rejectRequest: { text: "reason" }, clarify: { text: "comment" }, assignExistingCustomer: { businessPartner: "businessPartner" }, changeCustomerAssignment: { businessPartner: "businessPartner" } }`
  - `flag(action) = "can" + action[0].toUpperCase() + action.slice(1)`
  - Test helpers: `invoke(n, action, body = {}, { user = ALICE, ifMatch, headers = {} } = {})` → `POST url(n, "/CustomerMonitorService." + action)` with `If-Match` (default `await etag(n, user)`) plus `headers`; `flags(n, user = ALICE)` → object of the 11 booleans from `GET url(n, "?$select=" + FLAGS.join(","))`; `FLAGS` = the 11 names above.

- [ ] **Step 1: Rewrite the tests**

Replace helpers `executeStep`/`stepCodes` by `invoke`/`flags`. Rewrite every call site: `executeStep(n, { step: "CREATE" })` → `invoke(n, "createCustomer")`; `{ step: "CNG_DEBI", businessPartner }` → `invoke(n, "changeCustomerAssignment", { businessPartner })`; `{ step: "REJECT", text }` → `invoke(n, "rejectRequest", { reason: text })`; `{ step: "CLARIFY", text }` → `invoke(n, "clarify", { comment: text })`; `stepCodes(n)` expectations → `flags(n)` expectations, e.g. for #1: `expect(await flags(1)).toMatchObject({ canClarify: true, canCreateCustomer: true, canAssignExistingCustomer: true, canCompleteManually: true, canReject: true, canRelease: false, canReset: false, canCreateShipTo: false, canModifyContact: false, canConvertToNewCustomer: false, canChangeCustomerAssignment: false })`; #2 → `canRelease`/`canReject` only; #12 → `canReset` only; BOB → all false and `invoke(6, "completeManually", {}, { user: BOB })` → 403. The metadata test expects `Name="release"` … `Name="changeCustomerAssignment"` and `Core.OperationAvailable` with `Path="in/canRelease"`, and must not match `Name="executeStep"`. Keep the 409 `CONFIRM_REQUIRED` + `force` expectations **for now** (Task 6 replaces them): pass `force: true` via body as today. Add:

```js
test("flags with narrow $select are still computed", async () => {
	const { data } = await GET(url(1, "?$select=name,canReject,canReset"), ALICE);
	expect(data).toMatchObject({ canReject: true, canReset: false });
});
test("action on a draft → 400 STEP_NOT_ALLOWED; action on active with foreign draft → 409 and flags false", async () => {
	await edit(6);
	const onDraft = await failure(POST(url(6, "/CustomerMonitorService.completeManually", false), {}, { ...ALICE, headers: { "If-Match": await draftEtag(6) } }));
	expect(onDraft.status).toBe(400);
	expect(onDraft.data.error.code).toBe("STEP_NOT_ALLOWED");
	const locked = await failure(invoke(6, "completeManually", {}, { user: CAROL }));
	expect(locked.status).toBe(409);
	expect(locked.data.error.code).toBe("DRAFT_ALREADY_EXISTS");
	expect(Object.values(await flags(6, CAROL)).every((v) => v === false)).toBe(true);
});
test("If-Match * on action → 412", async () => {
	expect((await failure(invoke(6, "completeManually", {}, { ifMatch: "*" }))).status).toBe(412);
});
test("releaseState after RELEASE is MANUAL", async () => {
	await invoke(2, "release");
	expect((await GET(url(2, "?$select=releaseState"), ALICE)).data.releaseState).toBe("MANUAL");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js`
Expected: FAIL (unknown actions / properties)

- [ ] **Step 3: Declare the actions and flags in CDS**

`db/schema.cds`: eleven `virtual canXxx : Boolean;` after `editHidden`.
`srv/monitor-service.cds`: replace the `actions { … }` block of `Requests` by the eleven actions from docs/09 §4.1 (each `action name(in : $self, …) returns Requests;` with `@Core.OperationAvailable: ( :in.canXxx )`; `@Common.IsActionCritical` on the seven parameter-less ones; parameters `@mandatory @title: '{i18n>param.reason}' @UI.MultiLineText reason : String(100)` etc.). `@restrict` → `[{ grant: 'READ', to: 'MonitorViewer' }, { grant: ['UPDATE', <11 action names>], to: 'MonitorEditor' }]`. Delete `type StepOption`. Add the `annotate CustomerMonitorService.Requests with actions { <each action> @Common.SideEffects: { TargetProperties: [...], TargetEntities: ['in/log','in/admin','in/shipTo','in/salesData'] }; }` block (property list from docs/09 §4.1). `@Core.Computed` for all eleven flags.
Verify: `npx cds compile srv --to edmx | grep -c 'Core.OperationAvailable'` → `11`.

- [ ] **Step 4: Implement flags and dispatcher in `srv/monitor-service.js`**

- Constants `STEP_ACTIONS`, `ACTION_STEPS`, `PARAMS`, `flag`, `FLAG_INPUT = ["ID","status_code","released","inClarification","source","processType"]`.
- `hasDraft(ids)` → `Set` of IDs from `SELECT.from(Requests.drafts).columns("ID").where({ ID: { in: ids } })`.
- `setFlags(row, state, processSteps, roles, { draft = false, locked = false } = {})`: `codes = draft || locked ? [] : sm.availableStepCodes(state, processSteps, roles)`; every flag `= codes.includes(step)`; `row.isEditable = draft ? true : sm.isEditable(state, roles.isEditor)`; `row.editHidden = !row.isEditable`.
- `after READ [Requests, Requests.drafts]`: rows with `ID`; `draft = !!req.target.isDraft`; load `processSteps` once and `drafted = draft ? new Set() : await hasDraft(ids)`; re-select `FLAG_INPUT` for rows missing any of them; `setFlags(row, state, processSteps, roles(req), { draft, locked: drafted.has(row.ID) })`.
- `const isStrict = (req) => /\bhandling=strict\b/i.test(req.headers.prefer || "");` (module level).
- `this.on(Object.values(STEP_ACTIONS), [Requests, Requests.drafts], handler)`: draft target → `400 STEP_NOT_ALLOWED` (message with `ACTION_STEPS[req.event]`); `await delay()`; `ID = lastKey(req)`; `request = await loadRequest(req, ID)`; keep the existing `sameETag` check (`412 ETAG_REQUIRED`); `if ((await hasDraft([ID])).size) req.reject({ status: 409, code: "DRAFT_ALREADY_EXISTS", message: t(req, "DRAFT_ALREADY_EXISTS") })`; `step = ACTION_STEPS[req.event]`; `params = { <text|businessPartner> taken from req.data via PARAMS[req.event], force: !isStrict(req) }` (the actions have no `force` parameter: a call **without** `Prefer: handling=strict` counts as confirmed); the rest of the body (status machine call, abort log, persistence, log, messages, re-read) moves over from the old `executeStep` handler unchanged — the `CONFIRM_REQUIRED` branch still answers `409` in this task; set flags on `updated` via `setFlags(updated, updated, processSteps, roles(req))` and return it.
- Delete the `availableSteps` and `executeStep` handlers.

Note on the tests: the `CONFIRM_REQUIRED` tests therefore send `Prefer: handling=strict` to get the 409 and omit the header to confirm (`invoke(n, action, body, { headers: { Prefer: "handling=strict" } })`). Task 6 only changes the response shape (409 → 412 + `Preference-Applied`).

- [ ] **Step 5: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS

- [ ] **Step 6: Update docs and commit**

`docs/03_service_vertrag.md`: §3 service CDS (actions, `@restrict`), §4 → "Aktionsverfügbarkeit (`can*`-Flags)", §5 → "Aktionen je Schritt" with the step↔action table; remove `availableSteps`/`executeStep`/`StepOption`. `docs/02_architektur.md` E-04 already reworded.

```bash
git add db srv test docs/03_service_vertrag.md
git commit -m "feat(F-13): bound action per step with can* flags and generic dispatcher"
git push
```

---

### Task 6: Strict handling, messages, error targets (F-14)

**Files:**
- Modify: `srv/monitor-service.js` (dispatcher error branch, success/warn messages, `on('error')`)
- Modify: `srv/lib/errors.js` (no change to codes; `INPUT_REQUIRED` stays for non-OData callers)
- Modify: `_i18n/messages.properties`, `_i18n/messages_de.properties` (`ACTION_DONE`, `ACTION_DONE_STATUS`)
- Modify: `test/monitor-service.test.js` (describe `F-14 strict handling and messages`; adjust the `CONFIRM_REQUIRED` tests)

**Interfaces:**
- Consumes: Task 5 dispatcher.
- Produces: `isStrict(req)`; on `CONFIRM_REQUIRED` → HTTP 412 with header `Preference-Applied: handling=strict`, body `error.code = "CONFIRM_REQUIRED"`, `error.details[0] = { code, message, "@Common.numericSeverity": 3 }`; parameter errors carry `error.target` (`businessPartner`); success → exactly one `sap-messages` entry with `numericSeverity: 1`; `ETAG_REQUIRED` text for 428 and CAP 412.

- [ ] **Step 1: Write the failing tests**

Replace the `CONFIRM_REQUIRED` expectations (409) by:
```js
describe("F-14 strict handling and messages", () => {
	test("question → 412 with Preference-Applied, confirmed without Prefer → 110", async () => {
		const res = await failure(invoke(5, "changeCustomerAssignment", { businessPartner: "1000002" }, { headers: { Prefer: "handling=strict" } }));
		expect(res.status).toBe(412);
		expect(res.headers["preference-applied"]).toBe("handling=strict");
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
		expect(res.data.error.details[0]["@Common.numericSeverity"]).toBe(3);
		expect(res.data.error.details[0].message).toMatch(/4000002/);
		const { data } = await invoke(5, "changeCustomerAssignment", { businessPartner: "0001000002" });
		expect(data).toMatchObject({ status_code: "110", processType: "CH_DEB", customer: "4000002" });
	});
	test("stale ETag with Prefer → plain 412 without Preference-Applied", async () => {
		const stale = await etag(6);
		await invoke(6, "clarify", { comment: "x" });
		const res = await failure(invoke(6, "completeManually", {}, { ifMatch: stale, headers: { Prefer: "handling=strict" } }));
		expect(res.status).toBe(412);
		expect(res.headers["preference-applied"]).toBeUndefined();
	});
	test("missing mandatory parameter → 400 ASSERT_MANDATORY with target", async () => {
		const res = await failure(invoke(1, "rejectRequest", {}));
		expect(res.status).toBe(400);
		expect(res.data.error.target).toBe("reason");
	});
	test("BP errors target the businessPartner parameter", async () => {
		const res = await failure(invoke(13, "changeCustomerAssignment", { businessPartner: "9999999" }));
		expect(res.data.error).toMatchObject({ code: "BP_NOT_FOUND", target: "businessPartner" });
	});
	test("success → exactly one sap-message with severity 1; error status → warnings", async () => {
		const ok = await invoke(6, "modifyContact");
		const messages = JSON.parse(ok.headers["sap-messages"]);
		expect(messages).toHaveLength(1);
		expect(messages[0].numericSeverity).toBe(1);
		const failed = await invoke(3, "createCustomer");
		expect(failed.status).toBe(200);
		expect(JSON.parse(failed.headers["sap-messages"]).every((m) => m.numericSeverity === 3)).toBe(true);
	});
});
```
Also update the old `unknown BP → BP_NOT_FOUND; missing input → INPUT_REQUIRED` test: the missing-input case now expects status 400 and `target === "businessPartner"` (CAP `@mandatory`), not `INPUT_REQUIRED`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-14"`
Expected: FAIL (409 instead of 412, no header)

- [ ] **Step 3: Implement**

- `const isStrict = (req) => /\bhandling=strict\b/i.test(req.headers.prefer || "");` and in the dispatcher `force = !isStrict(req)`.
- Error branch: if `e.code === ErrorCodes.CONFIRM_REQUIRED` → `(req.res ?? req.http.res).set("Preference-Applied", "handling=strict"); return req.reject({ status: 412, code: e.code, message, details: [{ code: e.code, message, numericSeverity: 3 }] });` else `return req.reject({ status: e.status, code: e.code, message, target: ["BP_NOT_FOUND", "BP_NOT_CUSTOMER", "INPUT_REQUIRED", "INPUT_TOO_LONG"].includes(e.code) ? (PARAMS[req.event] ? Object.values(PARAMS[req.event])[0] : undefined) : undefined })`.
- Messages: after persisting, if `result.failed` → `req.warn({ message })` per message (as today, `target` omitted); else `req.notify({ message: t(req, result.requestChanges.status_code ? "ACTION_DONE_STATUS" : "ACTION_DONE", [stepText, statusText]) })` where `stepText` = localized `Steps.text` of `step` and `statusText` = localized `Statuses.text` of the new status (one `SELECT.localized.one.from(db.Statuses).where({ code })`). The per-message `req.info` calls are removed (log entries keep every message).
- `_i18n`: `ACTION_DONE={0} executed` / `ACTION_DONE_STATUS={0}: new status "{1}"`; DE `{0} ausgeführt` / `{0}: neuer Status „{1}“`.
- `on('error')`: `if (s === 428 || (s === 412 && err.code === "412")) { err.status = err.statusCode = 412; err.code = "412"; err.message = t(req, "ETAG_REQUIRED"); }`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:srv`
Expected: PASS. If the `ASSERT_MANDATORY` test fails because CAP returns a different code, assert only `status === 400` and `target === "reason"` and note the code in docs/03.

- [ ] **Step 5: Update docs and commit**

`docs/03_service_vertrag.md` §5.1 error table (412 strict row with header, `ASSERT_MANDATORY` 400 with `target`, `target` for BP errors), new §5.3 "Rückfragen (strict handling)", §5.2 messages (`notify` toast / `warn` dialog), §7 Prefer semantics in the mock.

```bash
git add srv _i18n test docs/03_service_vertrag.md
git commit -m "feat(F-14): strict handling for confirmations, success toast message, error targets"
git push
```

---

### Task 7: Labels, texts, value lists, search (F-15)

**Files:**
- Create: `srv/monitor-annotations.cds`
- Create: `_i18n/i18n.properties`, `_i18n/i18n_de.properties`
- Modify: `app/monitor/webapp/i18n/i18n.properties`, `app/monitor/webapp/i18n/i18n_de.properties` (remove `field.*` only after the freestyle views no longer need them → **not in this task**; keep the app bundle untouched, note it for F-21)
- Modify: `srv/monitor-service.cds` (`using` nothing; annotations file is picked up automatically from `srv/`)
- Test: `test/monitor-service.test.js` (describe `F-15 labels and texts`)

**Interfaces:**
- Produces in `$metadata`: `Common.Label` per element/parameter from `{i18n>field.*}` / `{i18n>param.*}`; `Common.Text`/`TextArrangement` on `status_code`, `processType`, `releaseState`; `Common.ValueList` (+ `ValueListWithFixedValues`) on `status_code`, `processType`, `statusGroup`; `Common.ValueList` on `salesOrganization`, `source`; `@cds.search` on `name`, `name2`, `magentoCompany`; `UI.Hidden` on `statusCriticality`, `orderCriticality`, `releaseCriticality`, `editHidden`.

- [ ] **Step 1: Write the failing tests**

```js
describe("F-15 labels and texts", () => {
	test("$metadata labels follow Accept-Language", async () => {
		const de = (await GET(`${BASE}/$metadata`, { ...ALICE, headers: { "Accept-Language": "de" } })).data;
		const en = (await GET(`${BASE}/$metadata`, { ...ALICE, headers: { "Accept-Language": "en" } })).data;
		expect(de).toMatch(/Property="salesOrganization"[\s\S]*?Common.Label" String="Verkaufsorganisation"/);
		expect(en).toMatch(/Property="salesOrganization"[\s\S]*?Common.Label" String="Sales Organization"/);
		expect(en).toMatch(/Common.Text" Path="status\/text"/);
		expect(en).toMatch(/Common.ValueList/);
	});
	test("$search covers name, name2 and magentoCompany", async () => {
		expect((await GET(`${BASE}/Requests?$search=Hydraulik&$select=name`, ALICE)).data.value.some((r) => r.name === "Müller Hydraulik GmbH")).toBe(true);
		expect((await GET(`${BASE}/Requests?$search=MC102&$select=magentoCompany`, ALICE)).data.value.map((r) => r.magentoCompany)).toEqual(["MC102"]);
	});
});
```
(The label regexes assume the `Common.Label` annotation follows the `<Property …>` tag in the EDMX; adjust to `Annotations Target="…Requests/salesOrganization"` form if CAP emits labels in a separate block.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/monitor-service.test.js -t "F-15"`
Expected: FAIL

- [ ] **Step 3: Create the annotation file and bundles**

`srv/monitor-annotations.cds` with `using CustomerMonitorService as S from './monitor-service';` and the blocks from docs/09 §4.5 (`annotate S.Requests with { … }` for texts/value lists/labels/hidden; `annotate S.Requests with @cds.search: { name, name2, magentoCompany };`; `annotate S.Statuses/ProcessTypes/StatusGroups/ReleaseStates with { code @Common.Text: text @Common.TextArrangement: #TextOnly; }` (Statuses `#TextFirst`); `annotate S.LogEntries with { … @title … }`; `annotate S.SalesData/ContactPersons/ShipToParties with { … @title … }`; action parameters `@title: '{i18n>param.reason}'` etc. are already in `monitor-service.cds`).
`_i18n/i18n.properties`: copy the 49 `field.*` keys from `app/monitor/webapp/i18n/i18n.properties`, split `field.streetHouseNumber` → `field.street=Street`, `field.houseNumber=House Number` and `field.postalCodeCity` → `field.postalCode=Postal Code`, `field.city=City`; add `field.status=Status`, `field.processType=Process Type`, `field.statusGroup=Status Group`, `field.released=Released`, `field.releaseState=Release`, `field.inClarification=In Clarification`, `field.orderVolume=Order Volume`, `field.currency=Currency`, `field.clarificationComment=Clarification Comment`, `param.reason=Reason`, `param.comment=Comment`, `param.businessPartner=Business Partner`, `action.release=Release`, `action.rejectRequest=Reject Request`, `action.clarify=In Clarification`, `action.reset=Process Again`, `action.createCustomer=Create Customer and Admin`, `action.createShipTo=Create Ship-To Party`, `action.modifyContact=Create/Change Contact Person`, `action.convertToNewCustomer=Convert to New Customer`, `action.completeManually=Complete Manually`, `action.assignExistingCustomer=Duplicate – Assign Customer`, `action.changeCustomerAssignment=Change Customer Assignment`, `log.type=Type`, `log.createdAt=Time`, `log.createdBy=User`, `log.step=Step`, `log.messageText=Message`, `log.fieldName=Field`, `log.oldValue=Old Value`, `log.newValue=New Value`, `request=Request`, `requests=Requests`. `_i18n/i18n_de.properties`: German counterparts taken from `app/monitor/webapp/i18n/i18n_de.properties` (`field.*`) and the `Steps_texts.csv` de rows (`action.*`); `request=Vorgang`, `requests=Vorgänge`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:srv` and `npx cds compile srv --to edmx | grep -c Common.Label`
Expected: PASS; label count > 80.

- [ ] **Step 5: Update docs and commit**

`docs/03_service_vertrag.md` §8: labels/texts/value lists/search (which file owns what); `docs/02_architektur.md` E-13 already present; `CLAUDE.md` migration note already present (no change).

```bash
git add srv _i18n test docs/03_service_vertrag.md
git commit -m "feat(F-15): service-side labels, texts, value lists and search"
git push
```

---

### Task 8: Contract document consolidation (closes F-11 … F-15)

**Files:**
- Modify: `docs/03_service_vertrag.md` (read it fully; reconcile the sections touched in Tasks 1–7 into one consistent document: §2 entities, §3 service/keys/draft, §4 flags, §5 actions + errors + strict handling, §6 draft editing, §7 mock behaviour, §8 code lists/texts)
- Modify: `docs/06_backlog.md` (F-11 … F-15 → `erledigt`, with Jest counts)

- [ ] **Step 1: Reconcile docs/03** so that no sentence still describes `executeStep`, `availableSteps`, `CONFIRM_REQUIRED` as 409, PATCH on actives, or the parent-ETag bump.

- [ ] **Step 2: Verify**

Run: `grep -n "executeStep\|availableSteps\|StepOption" docs/03_service_vertrag.md srv db test` → no hits except historical notes; `npm run test:srv` → PASS; `npx cds compile srv --to edmx > /dev/null` → no output.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(F-11..F-15): service contract consolidated for the Fiori Elements migration"
git push
```
