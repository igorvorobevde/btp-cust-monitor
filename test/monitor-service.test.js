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

	test("rowCriticality and log criticality", async () => {
		const crit = async (n) => (await GET(url(n, "?$select=rowCriticality"), ALICE)).data.rowCriticality;
		expect(await crit(3)).toBe(1); expect(await crit(12)).toBe(5); expect(await crit(1)).toBe(0);
		expect(await crit(26)).toBe(5); // open with order
		const { data } = await GET(url(1, "/log?$select=messageType,criticality&$top=1"), ALICE);
		expect(data.value[0]).toMatchObject({ messageType: "S", criticality: 3 });
	});
});

describe("F-24 priority", () => {
	test("priority follows the status group and sorts errors first, then longest waiting", async () => {
		const { data } = await GET(`${BASE}/Requests?$orderby=priority asc,waitingSince asc&$select=ID,priority,statusGroup`, ALICE);
		expect(data.value.slice(0, 4).map((r) => r.statusGroup)).toEqual(["ERROR", "ERROR", "ERROR", "ERROR"]);
		expect(data.value[0].ID).toBe(id(3));
		expect(data.value[4].statusGroup).toBe("OPEN");
		expect(data.value.at(-1).priority).toBe(4);
		expect((await GET(`${BASE}/Requests?$filter=priority eq 3&$count=true&$top=0`, ALICE)).data["@odata.count"]).toBe(2); // #11, #23
	});
	test("$metadata: capabilities, side effects and no orderCriticality", async () => {
		const meta = (await GET(`${BASE}/$metadata`, ALICE)).data;
		expect(meta).toMatch(/NonSortableProperties[\s\S]*?<PropertyPath>nextStepText<\/PropertyPath>/);
		expect(meta).toMatch(/NonFilterableProperties[\s\S]*?<PropertyPath>waitingText<\/PropertyPath>/);
		for (const term of ["NonSortableProperties", "NonFilterableProperties"]) {
			const block = meta.match(new RegExp(`${term}[\\s\\S]*?</Collection>`))[0];
			for (const f of ["waitingText", "nextStep", "nextStepText"]) expect(block).toContain(`<PropertyPath>${f}</PropertyPath>`);
		}
		expect((meta.match(/in\/rowCriticality/g) || []).length).toBe(11);
		expect((meta.match(/in\/priority/g) || []).length).toBe(11);
		expect(meta).not.toMatch(/Name="orderCriticality"/);
	});
});

describe("F-25 release reason", () => {
	const reason = async (n, user = ALICE) => (await GET(url(n, "?$select=released,releaseProcedure,releaseReason,releaseLimit"), user)).data;
	test("demo data carries the reason of the release check", async () => {
		expect(await reason(1)).toMatchObject({ releaseReason: "NOT_REQUIRED", releaseLimit: null });
		expect(await reason(2)).toMatchObject({ released: false, releaseReason: "MANUAL_REQUIRED", releaseLimit: null });
		expect(await reason(10)).toMatchObject({ releaseReason: "ALWAYS" });
		const cc = await reason(3); expect(cc.releaseReason).toBe("CREDIT_CARD"); expect(Number(cc.releaseLimit)).toBe(5000);
		expect((await reason(11)).releaseReason).toBe("UNDER_LIMIT");
		const manual = await reason(15); expect(manual).toMatchObject({ releaseReason: "MANUAL", releaseProcedure: "MANUAL" }); expect(Number(manual.releaseLimit)).toBe(5000);
	});
	test("release → MANUAL; convertToNewCustomer re-check → NO_VOLUME (#5) and UNDER_LIMIT (#26)", async () => {
		expect((await invoke(2, "release")).data).toMatchObject({ released: true, releaseProcedure: "MANUAL", releaseReason: "MANUAL" });
		const noVolume = (await invoke(5, "convertToNewCustomer")).data;
		expect(noVolume).toMatchObject({ released: false, releaseReason: "NO_VOLUME" }); expect(Number(noVolume.releaseLimit)).toBe(5000);
		const under = (await invoke(26, "convertToNewCustomer")).data;
		expect(under).toMatchObject({ released: true, releaseProcedure: "AUTOMATIC", releaseReason: "UNDER_LIMIT" });
	});
	test("releaseReasonRef expands with localized texts; ReleaseReasons is a code list; $metadata carries Common.Text", async () => {
		const expand = "?$select=releaseReason&$expand=releaseReasonRef($select=text)";
		expect((await GET(url(2, expand), { ...ALICE, headers: { "Accept-Language": "de" } })).data.releaseReasonRef.text).toBe("Manuelle Freigabe vorgeschrieben (Customizing)");
		expect((await GET(url(2, expand), ALICE)).data.releaseReasonRef.text).toBe("Manual release required (customizing)");
		expect((await GET(`${BASE}/ReleaseReasons`, ALICE)).data.value.map((r) => r.code).sort())
			.toEqual(["ALWAYS", "CREDIT_CARD", "MANUAL", "MANUAL_REQUIRED", "NOT_REQUIRED", "NO_RULE", "NO_VOLUME", "OVER_LIMIT", "UNDER_LIMIT"]);
		const meta = (await GET(`${BASE}/$metadata`, ALICE)).data;
		expect(meta).toMatch(/Common.Text" Path="releaseReasonRef\/text"/);
		expect((meta.match(/in\/releaseReason/g) || []).length).toBe(11);
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

	describe("F-23 child entities and log follow the request's visibility", () => {
		const CHILDREN = ["SalesData", "ContactPersons", "ShipToParties", "LogEntries"];
		const visibleIds = async (user) => new Set((await GET(`${BASE}/Requests?$select=ID`, user)).data.value.map((r) => r.ID));
		const requestIds = async (entity, user) => (await GET(`${BASE}/${entity}?$select=request_ID`, user)).data.value.map((r) => r.request_ID);
		test.each(CHILDREN)("bob reads %s only of requests he can see", async (entity) => {
			const visible = await visibleIds(BOB);
			const ids = await requestIds(entity, BOB);
			expect(ids.length).toBeGreaterThan(0);
			expect(ids.filter((rid) => !visible.has(rid))).toEqual([]);
		});
		test.each(CHILDREN)("alice still reads every %s row", async (entity) => {
			const all = await cds.db.run(SELECT.from(`hydac.custmon.${entity}`).columns("request_ID"));
			expect((await requestIds(entity, ALICE)).length).toBe(all.length);
		});
		test("bob gets nothing via navigation from an invisible request (#2)", async () => {
			const log = await GET(url(2, "/log"), BOB).then((r) => r.data.value, (e) => e.response.status);
			expect(log === 404 || (Array.isArray(log) && log.length === 0)).toBe(true);
			for (const path of ["/salesData", "/admin", "/shipTo"]) {
				const status = await GET(url(2, path), BOB).then((r) => (r.status === 200 && r.data && r.data.ID ? "data" : r.status), (e) => e.response.status);
				expect([path, status]).toEqual([path, expect.not.stringMatching(/^data$/)]);
			}
			const { data } = await GET(`${BASE}/LogEntries?$filter=request_ID eq ${id(2)}`, BOB);
			expect(data.value).toEqual([]);
		});
		test("LogEntries $expand=request only shows bob's requests", async () => {
			const { data } = await GET(`${BASE}/LogEntries?$expand=request($select=salesOrganization,released)`, BOB);
			expect(data.value.length).toBeGreaterThan(0);
			expect(data.value.every((e) => e.request && e.request.salesOrganization === "0001" && e.request.released)).toBe(true);
		});
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
	test("changeCustomerAssignment to BP of other Magento company → question (412 strict), confirmed → 110", async () => {
		const res = await failure(invoke(5, "changeCustomerAssignment", { businessPartner: "1000002" }, STRICT));
		expect(res.status).toBe(412);
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
		const { data } = await invoke(5, "changeCustomerAssignment", { businessPartner: "0001000002" });
		expect(data).toMatchObject({ status_code: "110", processType: "CH_DEB", customer: "4000002", contactPersonNumber: null });
	});

	test("assignExistingCustomer also checks Magento assignment (R-06)", async () => {
		const res = await failure(invoke(1, "assignExistingCustomer", { businessPartner: "1000002" }, STRICT));
		expect(res.status).toBe(412);
		expect(res.data.error.code).toBe("CONFIRM_REQUIRED");
	});

	test("BP without customer role → 400 BP_NOT_CUSTOMER", async () => {
		const res = await failure(invoke(13, "changeCustomerAssignment", { businessPartner: "1000003" }));
		expect(res.status).toBe(400);
		expect(res.data.error.code).toBe("BP_NOT_CUSTOMER");
	});

	test("unknown BP → 400 BP_NOT_FOUND; missing input → 400 with target", async () => {
		expect((await failure(invoke(13, "changeCustomerAssignment", { businessPartner: "9999999" }))).data.error.code).toBe("BP_NOT_FOUND");
		const missing = await failure(invoke(13, "changeCustomerAssignment"));
		expect(missing.status).toBe(400);
		expect(missing.data.error.target).toBe("businessPartner");
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

describe("F-14 strict handling and messages", () => {
	test("question → 412 with Preference-Applied and details, confirmed without Prefer → 110", async () => {
		const res = await failure(invoke(5, "changeCustomerAssignment", { businessPartner: "1000002" }, STRICT));
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
		const res = await failure(invoke(6, "completeManually", {}, { ifMatch: stale, ...STRICT }));
		expect(res.status).toBe(412);
		expect(res.headers["preference-applied"]).toBeUndefined();
	});

	test("missing mandatory parameter → 400 with target", async () => {
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
		const warnings = JSON.parse(failed.headers["sap-messages"]);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings.every((m) => m.numericSeverity === 3)).toBe(true);
	});
});

describe("F-15 labels and texts", () => {
	test("$metadata labels follow Accept-Language", async () => {
		const de = (await GET(`${BASE}/$metadata`, { ...ALICE, headers: { "Accept-Language": "de" } })).data;
		const en = (await GET(`${BASE}/$metadata`, { ...ALICE, headers: { "Accept-Language": "en" } })).data;
		expect(de).toMatch(/Common.Label" String="Verkaufsorganisation"/);
		expect(en).toMatch(/Common.Label" String="Sales Organization"/);
		expect(en).toMatch(/Common.Text" Path="status\/text"/);
		expect(en).toMatch(/Common.ValueList/);
		expect(en).toMatch(/Common.Label" String="Reason"/);
	});

	test("$search covers name, name2 and magentoCompany", async () => {
		expect((await GET(`${BASE}/Requests?$search=Hydraulik&$select=name`, ALICE)).data.value.some((r) => r.name === "Müller Hydraulik GmbH")).toBe(true);
		expect((await GET(`${BASE}/Requests?$search=MC102&$select=magentoCompany`, ALICE)).data.value.map((r) => r.magentoCompany)).toEqual(["MC102"]);
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
	test("draftEdit with If-Match: * → 412, no draft created", async () => {
		const res = await failure(POST(url(7, "/CustomerMonitorService.draftEdit"), { PreserveChanges: true }, { ...ALICE, headers: { "If-Match": "*" } }));
		expect(res.status).toBe(412);
		expect(res.data.error.message).toMatch(/ETag|reload|neu laden/i);
		expect((await failure(GET(url(7, "", false), ALICE))).status).toBe(404);
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

	test("activation writes only editable fields – read-only values changed meanwhile are kept", async () => {
		await edit(6);
		await patchDraft(6, "", { name2: "Werk Süd" });
		// simulate a concurrent change of the active record (a step that slipped past the draft guard)
		await cds.run(UPDATE("hydac.custmon.Requests").where({ ID: id(6) }).with({ status_code: "140", customer: "4999999" }));
		await activate(6);
		const { data } = await GET(url(6, "?$select=status_code,customer,name2"), ALICE);
		expect(data).toMatchObject({ status_code: "140", customer: "4999999", name2: "Werk Süd" });
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

	test("an expired draft lock no longer blocks steps for other users", async () => {
		await edit(6, CAROL);
		expect((await flags(6)).canClarify).toBe(false);
		const past = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // older than draft_lock_timeout (15min)
		await cds.run(UPDATE("DRAFT.DraftAdministrativeData").with({ LastChangeDateTime: past, CreationDateTime: past }));
		expect((await flags(6)).canClarify).toBe(true);
		expect((await invoke(6, "clarify", { comment: "Sperre abgelaufen" })).status).toBe(200);
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

describe("F-24 waiting time", () => {
	const waiting = async (n, user = ALICE, lang) => (await GET(url(n, "?$select=waitingSince,waitingText"), lang ? { ...user, headers: { "Accept-Language": lang } } : user)).data;
	test("#1 waits since its last change, text is localized", async () => {
		const en = await waiting(1);
		expect(Date.parse(en.waitingSince)).toBe(Date.parse("2026-10-01T08:15:00Z"));
		expect(en.waitingText).toMatch(/^\d+ days$/);
		expect((await waiting(1, ALICE, "de")).waitingText).toMatch(/^\d+ Tage$/);
	});
	test("release advances waitingSince, a failing step does not, draft activation does not", async () => {
		const before = (await waiting(2)).waitingSince;
		await invoke(2, "release");
		const after = await waiting(2);
		expect(Date.parse(after.waitingSince)).toBeGreaterThan(Date.parse(before));
		expect(after.waitingText).toBe("just now");
		const failed = (await waiting(3)).waitingSince;
		await invoke(3, "createCustomer"); // FEHLER → 150 stays 150
		expect((await waiting(3)).waitingSince).toBe(failed);
		const edited = (await waiting(6)).waitingSince;
		await edit(6); await patchDraft(6, "", { name2: "Zweig" }); await activate(6);
		expect((await waiting(6)).waitingSince).toBe(edited);
	});
	test("a new request without waitingSince waits since its insert (does not sort first as NULL)", async () => {
		await cds.db.run(INSERT.into("hydac.custmon.Requests").entries({ ID: id(99), processType: "CR_DEB", source: "SHOP", status_code: "000",
			salesOrganization: "2000", released: true, name: "Neuer Interessent GmbH" }));
		const fresh = await waiting(99);
		expect(Math.abs(Date.parse(fresh.waitingSince) - Date.now())).toBeLessThan(60000);
		expect(fresh.waitingText).toBe("just now");
		await cds.db.run(DELETE.from("hydac.custmon.Requests").where({ ID: id(99) }));
	});
	test("waitingSince is sortable, waitingText is neither filterable nor sortable", async () => {
		const { data } = await GET(`${BASE}/Requests?$orderby=waitingSince asc&$select=ID&$top=1`, ALICE);
		expect(data.value[0].ID).toBe(id(10));
		expect((await failure(GET(`${BASE}/Requests?$filter=waitingText eq 'x'`, ALICE))).status).toBe(400);
		expect((await failure(GET(`${BASE}/Requests?$orderby=waitingText`, ALICE))).status).toBe(400);
	});
	test("Fiori Elements editing-status filters stay allowed (draft elements are not blocked by the virtual guard)", async () => {
		const filters = [
			"IsActiveEntity eq false or SiblingEntity/IsActiveEntity eq null", // Alle
			"IsActiveEntity eq true and HasDraftEntity eq false", // Keine Änderungen
			"IsActiveEntity eq true and SiblingEntity/IsActiveEntity eq null and DraftAdministrativeData/InProcessByUser ne ''", // Gesperrt
			"IsActiveEntity eq false" // Ungesicherte Änderungen
		];
		const statuses = [];
		for (const filter of filters) {
			const request = GET(`${BASE}/Requests?$filter=${encodeURIComponent(filter)}&$select=ID`, ALICE);
			statuses.push(await request.then((r) => r.status, (e) => e.response.status));
		}
		expect(statuses).toEqual(filters.map(() => 200));
	});
});

describe("F-24 next step", () => {
	const next = async (n, user = ALICE, lang) => (await GET(url(n, "?$select=nextStep,nextStepText"), lang ? { ...user, headers: { "Accept-Language": lang } } : user)).data;
	test("#1 → CREATE for alice (localized text), #6 → AP_MODIFY for alice and nothing for bob", async () => {
		expect(await next(1)).toMatchObject({ nextStep: "CREATE", nextStepText: "Create Customer and Admin" });
		expect((await next(1, ALICE, "de")).nextStepText).toBe("Debitor und Admin anlegen");
		expect(await next(6)).toMatchObject({ nextStep: "AP_MODIFY" });
		expect(await next(6, BOB)).toMatchObject({ nextStep: null, nextStepText: null });
	});
	test("#2 unreleased → RELEASE for alice; invisible to carol (no releaser role); closed #12 → nothing", async () => {
		expect(await next(2)).toMatchObject({ nextStep: "RELEASE", nextStepText: "Release" });
		expect((await failure(GET(url(2, "?$select=nextStep"), CAROL))).status).toBe(404);
		expect(await next(12)).toMatchObject({ nextStep: null, nextStepText: null });
	});
	test("no recommendation on drafts and locked requests; the action response carries the new recommendation", async () => {
		await edit(6);
		expect((await GET(url(6, "?$select=nextStep", false), ALICE)).data.nextStep).toBeNull();
		expect((await next(6, CAROL)).nextStep).toBeNull();
		const { data } = await invoke(26, "changeCustomerAssignment", { businessPartner: "1000030" });
		expect(data).toMatchObject({ status_code: "110", nextStep: "AP_MODIFY", nextStepText: "Create/Change Contact Person" });
	});
});
