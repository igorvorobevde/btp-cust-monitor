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

/** Verfügbarkeits-Flags je Schrittaktion (03 §4) */
const FLAGS = ["canRelease", "canReject", "canClarify", "canReset", "canCreateCustomer", "canCreateShipTo", "canModifyContact",
	"canConvertToNewCustomer", "canCompleteManually", "canAssignExistingCustomer", "canChangeCustomerAssignment"];
/** Erwartung: nur die genannten Flags true */
const only = (...names) => Object.fromEntries(FLAGS.map((f) => [f, names.includes(f)]));

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

/** Gebundene Schrittaktion am aktiven Vorgang; ohne `Prefer: handling=strict` gilt eine Rückfrage als bestätigt (03 §5.3) */
async function invoke(n, action, body = {}, { user = ALICE, ifMatch, headers = {} } = {}) {
	const allHeaders = { "If-Match": ifMatch === undefined ? await etag(n, user) : ifMatch, ...headers };
	return POST(url(n, `/CustomerMonitorService.${action}`), body, { ...user, headers: allHeaders });
}
const STRICT = { headers: { Prefer: "handling=strict" } };

async function flags(n, user = ALICE) {
	const { data } = await GET(url(n, `?$select=${FLAGS.join(",")}`), user);
	return Object.fromEntries(FLAGS.map((f) => [f, data[f]]));
}

async function lastLog(n) {
	const { data } = await GET(url(n, "/log?$orderby=line desc&$top=1"), ALICE);
	return data.value[0];
}

beforeEach(async () => {
	await server.data.reset();
});

describe("F-01 / F-02 metadata and data", () => {
	test("$metadata contains the step actions with OperationAvailable and ETag", async () => {
		const { data } = await GET(`${BASE}/$metadata`, ALICE);
		for (const action of ["release", "rejectRequest", "clarify", "reset", "createCustomer", "createShipTo", "modifyContact",
			"convertToNewCustomer", "completeManually", "assignExistingCustomer", "changeCustomerAssignment"]) {
			expect(data).toMatch(new RegExp(`Name="${action}"`));
		}
		expect(data).toMatch(/Core.OperationAvailable" Path="in\/canRelease"/);
		expect(data).toMatch(/Common.SideEffects/);
		expect(data).not.toMatch(/Name="executeStep"|Name="availableSteps"/);
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
		expect(await flags(6, BOB)).toEqual(only());
		expect((await failure(invoke(6, "completeManually", {}, { user: BOB }))).status).toBe(403);
	});

	test("viewer cannot read unreleased request of other VKORG", async () => {
		expect((await failure(GET(url(2), BOB))).status).toBe(404);
	});
});

describe("F-13 availability flags", () => {
	test("not released → canRelease, canReject", async () => {
		expect(await flags(2)).toEqual(only("canRelease", "canReject"));
	});

	test("closed → canReset", async () => {
		expect(await flags(12)).toEqual(only("canReset"));
	});

	test("CR_DEB 000 → clarify + customizing steps", async () => {
		expect(await flags(1)).toEqual(only("canClarify", "canCreateCustomer", "canAssignExistingCustomer", "canCompleteManually", "canReject"));
	});

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
		expect(await flags(6, CAROL)).toEqual(only());
	});
});

describe("F-13 step actions per process type", () => {
	test("CR_DEB: createCustomer → 999 with new numbers", async () => {
		const { data } = await invoke(1, "createCustomer");
		expect(data.status_code).toBe("999");
		expect(data.customer).toMatch(/^4\d{7}$/);
		expect(data.businessPartner).toMatch(/^1\d{7}$/);
	});

	test("CR_DEB: createCustomer with FEHLER → 200 + error status 150 + sap-messages", async () => {
		const res = await invoke(3, "createCustomer");
		expect(res.status).toBe(200);
		expect(res.data.status_code).toBe("150");
		expect(JSON.parse(res.headers["sap-messages"])[0].numericSeverity).toBe(3);
	});

	test("CH_DEB: modifyContact → 999", async () => {
		expect((await invoke(5, "modifyContact")).data.status_code).toBe("999");
	});

	test("CH_DEB: modifyContact in VKORG 2000 without CRM → 422 STEP_ABORTED, logged", async () => {
		const res = await failure(invoke(4, "modifyContact"));
		expect(res.status).toBe(422);
		expect(res.data.error.code).toBe("STEP_ABORTED");
		const { data } = await GET(url(4, "?$select=status_code"), ALICE);
		expect(data.status_code).toBe("000");
		await new Promise((resolve) => setTimeout(resolve, 100)); // Abbruchlog wird nach dem Rollback geschrieben
		expect((await lastLog(4)).messageType).toBe("A");
	});

	test("CR_AP: modifyContact → 999 with contact person number", async () => {
		const { data } = await invoke(6, "modifyContact");
		expect(data.status_code).toBe("999");
		expect(data.contactPersonNumber).toMatch(/^\d{10}$/);
	});

	test("CR_WE: createShipTo → 999 with ship-to number", async () => {
		const { data } = await invoke(9, "createShipTo");
		expect(data.status_code).toBe("999");
		expect(data.shipToCustomer).toMatch(/^4\d{7}$/);
	});

	test("CH_AP: closed 997 → reset → 000", async () => {
		expect(await flags(10)).toEqual(only("canReset"));
		expect((await invoke(10, "reset")).data.status_code).toBe("000");
	});
});

describe("F-13 BP steps and confirmations", () => {
	test("changeCustomerAssignment to BP of other Magento company → CONFIRM_REQUIRED with strict handling, confirmed → 110", async () => {
		const res = await failure(invoke(5, "changeCustomerAssignment", { businessPartner: "1000002" }, STRICT));
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
		expect(res.data.error.message).toMatch(/4000002/);
		const { data } = await invoke(5, "changeCustomerAssignment", { businessPartner: "0001000002" });
		expect(data).toMatchObject({ status_code: "110", processType: "CH_DEB", customer: "4000002", contactPersonNumber: null });
	});

	test("assignExistingCustomer also checks Magento assignment (R-06)", async () => {
		const res = await failure(invoke(1, "assignExistingCustomer", { businessPartner: "1000002" }, STRICT));
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
	});

	test("BP without customer role → 400 BP_NOT_CUSTOMER", async () => {
		const res = await failure(invoke(13, "changeCustomerAssignment", { businessPartner: "1000003" }));
		expect(res.status).toBe(400);
		expect(res.data.error.code).toBe("BP_NOT_CUSTOMER");
	});

	test("unknown BP → 400 BP_NOT_FOUND; missing input → 400", async () => {
		expect((await failure(invoke(13, "changeCustomerAssignment", { businessPartner: "9999999" }))).data.error.code).toBe("BP_NOT_FOUND");
		expect((await failure(invoke(13, "changeCustomerAssignment"))).status).toBe(400);
	});

	test("convertToNewCustomer re-checks release (R-02)", async () => {
		const { data } = await invoke(5, "convertToNewCustomer");
		expect(data).toMatchObject({ processType: "CR_DEB", status_code: "120", released: false, customer: null });
	});
});

describe("F-13 special functions", () => {
	test("reset of rejected CR_DEB without customer → CR_DEB/120", async () => {
		const { data } = await invoke(11, "reset");
		expect(data).toMatchObject({ processType: "CR_DEB", status_code: "120" });
	});

	test("release sets MANUAL and releaseState", async () => {
		const { data } = await invoke(2, "release");
		expect(data).toMatchObject({ released: true, releaseProcedure: "MANUAL", releasedBy: "alice" });
		expect((await GET(url(2, "?$select=releaseState"), ALICE)).data.releaseState).toBe("MANUAL");
	});

	test("clarify sets flag and comment, then is no longer offered", async () => {
		const { data } = await invoke(1, "clarify", { comment: "Rückfrage USt-IdNr." });
		expect(data).toMatchObject({ inClarification: true, clarificationComment: "Rückfrage USt-IdNr." });
		expect((await flags(1)).canClarify).toBe(false);
	});

	test("rejectRequest text too long → INPUT_TOO_LONG; not allowed step → STEP_NOT_ALLOWED", async () => {
		expect((await failure(invoke(1, "rejectRequest", { reason: "x".repeat(101) }))).status).toBe(400);
		expect((await failure(invoke(1, "createShipTo"))).data.error.code).toBe("STEP_NOT_ALLOWED");
	});
});

describe("Optimistic concurrency (412)", () => {
	test("stale, missing or * ETag on a step action → 412", async () => {
		const stale = await etag(6);
		await invoke(6, "clarify", { comment: "x" });
		expect((await failure(invoke(6, "completeManually", {}, { ifMatch: stale }))).status).toBe(412);
		expect((await failure(POST(url(6, "/CustomerMonitorService.completeManually"), {}, ALICE))).status).toBe(412);
		expect((await failure(invoke(6, "completeManually", {}, { ifMatch: "*" }))).status).toBe(412);
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

	test("#14 assignExistingCustomer with free BP 1000030 → 130 without confirmation", async () => {
		const { data } = await invoke(14, "assignExistingCustomer", { businessPartner: "1000030" }, STRICT);
		expect(data).toMatchObject({ status_code: "130", processType: "CH_DEB", customer: "4000030" });
	});

	test("#15 CR_DEB 120 offers createCustomer / assignExistingCustomer", async () => {
		expect(await flags(15)).toEqual(only("canCreateCustomer", "canAssignExistingCustomer", "canCompleteManually", "canReject"));
	});

	test("#17 modifyContact fails again (admin name contains 'Fehler') → 140", async () => {
		const res = await invoke(17, "modifyContact");
		expect(res.data.status_code).toBe("140");
	});

	test("#18 / #19 unreleased in 7050 → release + reject", async () => {
		expect(await flags(18)).toEqual(only("canRelease", "canReject"));
		expect(await flags(19)).toEqual(only("canRelease", "canReject"));
	});

	test("#20 createShipTo → 999", async () => {
		expect((await invoke(20, "createShipTo")).data.status_code).toBe("999");
	});

	test("reset: #21 CR_WE → 010, #23 CH_DEB → 000, #24 CR_DEB with customer → CH_DEB/000", async () => {
		expect((await invoke(21, "reset")).data.status_code).toBe("010");
		expect((await invoke(23, "reset")).data).toMatchObject({ processType: "CH_DEB", status_code: "000" });
		expect((await invoke(24, "reset")).data).toMatchObject({ processType: "CH_DEB", status_code: "000" });
	});

	test("#26 changeCustomerAssignment: BP without customer role / free BP", async () => {
		expect((await failure(invoke(26, "changeCustomerAssignment", { businessPartner: "1000031" }))).data.error.code).toBe("BP_NOT_CUSTOMER");
		expect((await invoke(26, "changeCustomerAssignment", { businessPartner: "1000030" })).data.status_code).toBe("110");
	});
});
