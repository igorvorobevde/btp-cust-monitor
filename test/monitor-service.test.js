"use strict";

const cds = require("@sap/cds");

const server = cds.test(__dirname + "/..");
const { GET, POST, PATCH } = server;

const BASE = "/odata/v4/monitor";
const ALICE = { auth: { username: "alice", password: "alice" } };
const BOB = { auth: { username: "bob", password: "bob" } };
const CAROL = { auth: { username: "carol", password: "carol" } };
const id = (n) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Draft-Keys: aktiver Vorgang (IsActiveEntity=true) oder Entwurf (false) */
const url = (n, path = "", active = true) => `${BASE}/Requests(ID=${id(n)},IsActiveEntity=${active})${path}`;

/** Fehlerantwort statt Exception (cds.test wirft bei 4xx/5xx) */
async function failure(promise) {
	try {
		await promise;
	} catch (e) {
		return e.response;
	}
	throw new Error("Request was expected to fail");
}

async function etag(n, user = ALICE) {
	const { data } = await GET(url(n, "?$select=modifiedAt"), user);
	return data["@odata.etag"];
}

/** Bearbeitung beginnen: draftEdit mit ETag des aktiven Vorgangs → 201 + Entwurf */
async function edit(n, user = ALICE) {
	return POST(url(n, "/CustomerMonitorService.draftEdit"), { PreserveChanges: true }, { ...user, headers: { "If-Match": await etag(n, user) } });
}

async function draftEtag(n, path = "", user = ALICE) {
	const { data } = await GET(url(n, path + "?$select=modifiedAt", false), user);
	return data["@odata.etag"];
}

async function patchDraft(n, path, body, user = ALICE) {
	return PATCH(url(n, path, false), body, { ...user, headers: { "If-Match": await draftEtag(n, path, user) } });
}

async function activate(n, user = ALICE) {
	return POST(url(n, "/CustomerMonitorService.draftActivate", false), {}, { ...user, headers: { "If-Match": await draftEtag(n, "", user) } });
}

async function executeStep(n, body, { user = ALICE, ifMatch } = {}) {
	const headers = { "If-Match": ifMatch === undefined ? await etag(n, user) : ifMatch };
	return POST(url(n, "/CustomerMonitorService.executeStep"), body, { ...user, headers });
}

async function stepCodes(n, user = ALICE) {
	const { data } = await GET(url(n, "/CustomerMonitorService.availableSteps()"), user);
	return data.value.map((s) => s.step);
}

async function lastLog(n) {
	const { data } = await GET(url(n, "/log?$orderby=line desc&$top=1"), ALICE);
	return data.value[0];
}

beforeEach(async () => {
	await server.data.reset();
});

describe("F-01 / F-02 metadata and data", () => {
	test("$metadata contains actions and ETag", async () => {
		const { data } = await GET(`${BASE}/$metadata`, ALICE);
		expect(data).toMatch(/Name="availableSteps"/);
		expect(data).toMatch(/Name="executeStep"/);
		expect(data).toMatch(/Core.OptimisticConcurrency/);
	});

	test("26 requests with expanded compositions", async () => {
		const { data } = await GET(`${BASE}/Requests?$expand=status,salesData,admin,shipTo&$count=true`, ALICE);
		expect(data["@odata.count"]).toBe(26);
		expect(data.value.every((r) => r.status && r.salesData)).toBe(true);
	});

	test("texts follow Accept-Language", async () => {
		const de = await GET(`${BASE}/Statuses('899')`, { ...ALICE, headers: { "Accept-Language": "de" } });
		const en = await GET(`${BASE}/Statuses('899')`, { ...ALICE, headers: { "Accept-Language": "en" } });
		expect(de.data.text).toBe("Abgelehnt");
		expect(en.data.text).toBe("Rejected");
	});

	test("CREATE and DELETE on Requests → 405", async () => {
		expect((await failure(POST(`${BASE}/Requests`, {}, ALICE))).status).toBe(405);
		expect((await failure(server.axios.delete(url(1), { ...ALICE, headers: { "If-Match": "*" } }))).status).toBe(405);
	});
});

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

describe("F-11 value helps", () => {
	test("SalesOrganizations are distinct and restricted to the user's VKORG", async () => {
		expect((await GET(`${BASE}/SalesOrganizations`, ALICE)).data.value.map((v) => v.salesOrganization).sort()).toEqual(["0001", "2000", "7050"]);
		expect((await GET(`${BASE}/SalesOrganizations`, BOB)).data.value.map((v) => v.salesOrganization)).toEqual(["0001"]);
	});

	test("Sources are distinct", async () => {
		expect((await GET(`${BASE}/Sources`, ALICE)).data.value.map((v) => v.source)).toEqual(["SHOP"]);
	});
});

describe("Authorization", () => {
	test("viewer sees only own VKORG and released requests, cannot edit or execute", async () => {
		const { data } = await GET(`${BASE}/Requests?$select=salesOrganization,released,isEditable`, BOB);
		expect(data.value.length).toBe(17);
		expect(data.value.every((r) => r.salesOrganization === "0001" && r.released && r.isEditable === false)).toBe(true);
		expect(await stepCodes(6, BOB)).toEqual([]);
		expect((await failure(executeStep(6, { step: "MANUAL_OK" }, { user: BOB }))).status).toBe(403);
	});

	test("viewer cannot read unreleased request of other VKORG", async () => {
		expect((await failure(GET(url(2), BOB))).status).toBe(404);
	});
});

describe("F-03 availableSteps", () => {
	test("not released → RELEASE, REJECT", async () => {
		expect(await stepCodes(2)).toEqual(["RELEASE", "REJECT"]);
	});
	test("closed → RESET", async () => {
		expect(await stepCodes(12)).toEqual(["RESET"]);
	});
	test("CR_DEB 000 → CLARIFY + customizing steps, destructive last", async () => {
		expect(await stepCodes(1)).toEqual(["CLARIFY", "CREATE", "CHNG_OLD", "MANUAL_OK", "REJECT"]);
	});
});

describe("F-03 executeStep per process type", () => {
	test("CR_DEB: CREATE → 999 with new numbers", async () => {
		const { data } = await executeStep(1, { step: "CREATE" });
		expect(data.status_code).toBe("999");
		expect(data.customer).toMatch(/^4\d{7}$/);
		expect(data.businessPartner).toMatch(/^1\d{7}$/);
	});

	test("CR_DEB: CREATE with FEHLER → 200 + error status 150 + sap-messages", async () => {
		const res = await executeStep(3, { step: "CREATE" });
		expect(res.status).toBe(200);
		expect(res.data.status_code).toBe("150");
		expect(JSON.parse(res.headers["sap-messages"])[0].numericSeverity).toBe(3);
	});

	test("CH_DEB: AP_MODIFY → 999", async () => {
		expect((await executeStep(5, { step: "AP_MODIFY" })).data.status_code).toBe("999");
	});

	test("CH_DEB: AP_MODIFY in VKORG 2000 without CRM → 422 STEP_ABORTED, logged", async () => {
		const res = await failure(executeStep(4, { step: "AP_MODIFY" }));
		expect(res.status).toBe(422);
		expect(res.data.error.code).toBe("STEP_ABORTED");
		const { data } = await GET(url(4, "?$select=status_code"), ALICE);
		expect(data.status_code).toBe("000");
		await new Promise((resolve) => setTimeout(resolve, 100)); // Abbruchlog wird nach dem Rollback geschrieben
		expect((await lastLog(4)).messageType).toBe("A");
	});

	test("CR_AP: AP_MODIFY → 999 with contact person number", async () => {
		const { data } = await executeStep(6, { step: "AP_MODIFY" });
		expect(data.status_code).toBe("999");
		expect(data.contactPersonNumber).toMatch(/^\d{10}$/);
	});

	test("CR_WE: CREATE_WE → 999 with ship-to number", async () => {
		const { data } = await executeStep(9, { step: "CREATE_WE" });
		expect(data.status_code).toBe("999");
		expect(data.shipToCustomer).toMatch(/^4\d{7}$/);
	});

	test("CH_AP: closed 997 → RESET → 000", async () => {
		expect(await stepCodes(10)).toEqual(["RESET"]);
		expect((await executeStep(10, { step: "RESET" })).data.status_code).toBe("000");
	});
});

describe("F-03 BP steps and confirmations", () => {
	test("CNG_DEBI to BP of other Magento company → 409 CONFIRM_REQUIRED, then force → 110", async () => {
		const res = await failure(executeStep(5, { step: "CNG_DEBI", businessPartner: "1000002" }));
		expect(res.status).toBe(409);
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
		expect(res.data.error.message).toMatch(/4000002/);
		const { data } = await executeStep(5, { step: "CNG_DEBI", businessPartner: "0001000002", force: true });
		expect(data).toMatchObject({ status_code: "110", processType: "CH_DEB", customer: "4000002", contactPersonNumber: null });
	});

	test("CHNG_OLD also checks Magento assignment (R-06)", async () => {
		const res = await failure(executeStep(1, { step: "CHNG_OLD", businessPartner: "1000002" }));
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
	});

	test("BP without customer role → 400 BP_NOT_CUSTOMER", async () => {
		const res = await failure(executeStep(13, { step: "CNG_DEBI", businessPartner: "1000003" }));
		expect(res.status).toBe(400);
		expect(res.data.error.code).toBe("BP_NOT_CUSTOMER");
	});

	test("unknown BP → 400 BP_NOT_FOUND; missing input → INPUT_REQUIRED", async () => {
		expect((await failure(executeStep(13, { step: "CNG_DEBI", businessPartner: "9999999" }))).data.error.code).toBe("BP_NOT_FOUND");
		expect((await failure(executeStep(13, { step: "CNG_DEBI" }))).data.error.code).toBe("INPUT_REQUIRED");
	});

	test("CNG_NEW re-checks release (R-02)", async () => {
		const { data } = await executeStep(5, { step: "CNG_NEW" });
		expect(data).toMatchObject({ processType: "CR_DEB", status_code: "120", released: false, customer: null });
	});
});

describe("F-03 special functions", () => {
	test("RESET of rejected CR_DEB without customer → CR_DEB/120", async () => {
		const { data } = await executeStep(11, { step: "RESET" });
		expect(data).toMatchObject({ processType: "CR_DEB", status_code: "120" });
	});

	test("RELEASE sets MANUAL", async () => {
		const { data } = await executeStep(2, { step: "RELEASE" });
		expect(data).toMatchObject({ released: true, releaseProcedure: "MANUAL", releasedBy: "alice" });
	});

	test("CLARIFY sets flag and comment, then is no longer offered", async () => {
		const { data } = await executeStep(1, { step: "CLARIFY", text: "Rückfrage USt-IdNr." });
		expect(data).toMatchObject({ inClarification: true, clarificationComment: "Rückfrage USt-IdNr." });
		expect(await stepCodes(1)).not.toContain("CLARIFY");
	});

	test("REJECT text too long → INPUT_TOO_LONG; not allowed step → STEP_NOT_ALLOWED", async () => {
		expect((await failure(executeStep(1, { step: "REJECT", text: "x".repeat(101) }))).status).toBe(400);
		expect((await failure(executeStep(1, { step: "CREATE_WE" }))).data.error.code).toBe("STEP_NOT_ALLOWED");
	});
});

describe("Optimistic concurrency (412)", () => {
	test("stale or missing ETag on executeStep → 412", async () => {
		const stale = await etag(6);
		await executeStep(6, { step: "CLARIFY", text: "x" });
		expect((await failure(executeStep(6, { step: "MANUAL_OK" }, { ifMatch: stale }))).status).toBe(412);
		expect((await failure(POST(url(6, "/CustomerMonitorService.executeStep"), { step: "MANUAL_OK" }, ALICE))).status).toBe(412);
	});

});

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

	test("draft lock: second editor cannot edit or patch", async () => {
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

describe("Demo data (#14–#26)", () => {
	test("every process type and status group is present", async () => {
		const { data } = await GET(`${BASE}/Requests?$select=processType,status_code`, ALICE);
		const types = new Set(data.value.map((r) => r.processType));
		const statuses = new Set(data.value.map((r) => r.status_code));
		expect([...types].sort()).toEqual(["CH_AP", "CH_DEB", "CR_AP", "CR_DEB", "CR_WE"]);
		["000", "010", "110", "120", "130", "140", "150", "160", "899", "997", "998", "999"]
			.forEach((code) => expect(statuses).toContain(code));
	});

	test("#14 CHNG_OLD with free BP 1000030 → 130 without confirmation", async () => {
		const { data } = await executeStep(14, { step: "CHNG_OLD", businessPartner: "1000030" });
		expect(data).toMatchObject({ status_code: "130", processType: "CH_DEB", customer: "4000030" });
	});

	test("#15 CR_DEB 120 offers CREATE / CHNG_OLD", async () => {
		expect(await stepCodes(15)).toEqual(["CREATE", "CHNG_OLD", "MANUAL_OK", "REJECT"]);
	});

	test("#17 AP_MODIFY fails again (admin name contains 'Fehler') → 140", async () => {
		const res = await executeStep(17, { step: "AP_MODIFY" });
		expect(res.data.status_code).toBe("140");
	});

	test("#18 / #19 unreleased in 7050 → RELEASE + REJECT", async () => {
		expect(await stepCodes(18)).toEqual(["RELEASE", "REJECT"]);
		expect(await stepCodes(19)).toEqual(["RELEASE", "REJECT"]);
	});

	test("#20 CREATE_WE → 999", async () => {
		expect((await executeStep(20, { step: "CREATE_WE" })).data.status_code).toBe("999");
	});

	test("RESET: #21 CR_WE → 010, #23 CH_DEB → 000, #24 CR_DEB with customer → CH_DEB/000", async () => {
		expect((await executeStep(21, { step: "RESET" })).data.status_code).toBe("010");
		expect((await executeStep(23, { step: "RESET" })).data).toMatchObject({ processType: "CH_DEB", status_code: "000" });
		expect((await executeStep(24, { step: "RESET" })).data).toMatchObject({ processType: "CH_DEB", status_code: "000" });
	});

	test("#26 CNG_DEBI: BP without customer role / free BP", async () => {
		expect((await failure(executeStep(26, { step: "CNG_DEBI", businessPartner: "1000031" }))).data.error.code).toBe("BP_NOT_CUSTOMER");
		expect((await executeStep(26, { step: "CNG_DEBI", businessPartner: "1000030" })).data.status_code).toBe("110");
	});
});
