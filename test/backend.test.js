"use strict";

// B-04: the service reaches the system of record only through the backend interface (srv/backend).
// A recording adapter wraps the mock; steps and draft activation must go through it.
process.env.cds_requires_backend_kind = "recording";
const cds = require("@sap/cds");
const { createBackend, registerBackend } = require("../srv/backend");

const calls = [];
registerBackend("recording", () => {
	const mock = require("../srv/backend/mock")();
	return {
		kind: "recording",
		loadCustomizing: (req) => mock.loadCustomizing(req),
		executeStep: (request, step, params, ctx) => {
			calls.push({ fn: "executeStep", id: request.ID, step, params });
			return mock.executeStep(request, step, params, ctx);
		},
		saveChanges: (request, changes, ctx) => {
			calls.push({ fn: "saveChanges", id: request.ID, fields: changes.map((c) => c.field) });
			return mock.saveChanges(request, changes, ctx);
		}
	};
});

const { GET, POST, PATCH } = cds.test(__dirname + "/..");
const ALICE = { auth: { username: "alice", password: "alice" } };
const BASE = "/odata/v4/monitor";
const ID = "a1b2c3d4-0000-4000-8000-000000000006";
const url = (active, path = "") => `${BASE}/Requests(ID=${ID},IsActiveEntity=${active})${path}`;
const etag = async (active) => (await GET(url(active, "?$select=modifiedAt"), ALICE)).data["@odata.etag"];

describe("B-04 backend interface", () => {
	test("default kind is mock; an unknown kind is rejected with the known kinds", () => {
		expect(createBackend("mock").kind).toBe("mock");
		expect(() => createBackend("s4-not-yet")).toThrow(/Unknown backend kind 's4-not-yet'.*mock/);
	});

	test("a step action goes through executeStep with the dialog parameters", async () => {
		await POST(url(true, "/CustomerMonitorService.clarify"), { comment: "Seam" }, { ...ALICE, headers: { "If-Match": await etag(true) } });
		expect(calls).toContainEqual({ fn: "executeStep", id: ID, step: "CLARIFY", params: { businessPartner: undefined, text: "Seam", force: true } });
	});

	test("draft activation hands the field changes to saveChanges before the local write", async () => {
		await POST(url(true, "/CustomerMonitorService.draftEdit"), { PreserveChanges: true }, { ...ALICE, headers: { "If-Match": await etag(true) } });
		await PATCH(url(false), { name2: "Über die Schnittstelle" }, { ...ALICE, headers: { "If-Match": await etag(false) } });
		await POST(url(false, "/CustomerMonitorService.draftActivate"), {}, { ...ALICE, headers: { "If-Match": await etag(false) } });
		expect(calls).toContainEqual({ fn: "saveChanges", id: ID, fields: ["name2"] });
		expect((await GET(url(true, "?$select=name2"), ALICE)).data.name2).toBe("Über die Schnittstelle");
	});
});
