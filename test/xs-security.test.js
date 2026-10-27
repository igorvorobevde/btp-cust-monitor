"use strict";

// O-01: xs-security.json must cover every role and attribute the service uses (CDS @requires/@restrict,
// handler checks such as MonitorReleaser) and the roles of the mock users in .cdsrc.json.
const cds = require("@sap/cds");
const path = require("path");

const root = path.join(__dirname, "..");
const xs = require(path.join(root, "xs-security.json"));
const scopeNames = (scopes) => scopes.map((s) => s.name.replace("$XSAPPNAME.", "")).sort();

describe("O-01 xs-security.json", () => {
	test("contains a scope for every role in @requires/@restrict of the service model, and the SalesOrg attribute", async () => {
		const csn = await cds.load(path.join(root, "srv"));
		const roles = new Set();
		for (const def of Object.values(csn.definitions)) {
			[].concat(def["@requires"] || []).forEach((r) => roles.add(r));
			for (const rule of [].concat(def["@restrict"] || [])) {
				[].concat(rule.to || []).forEach((r) => roles.add(r));
			}
		}
		roles.delete("authenticated-user");
		roles.delete("any");
		expect(roles.size).toBeGreaterThan(0);
		expect(scopeNames(xs.scopes)).toEqual(expect.arrayContaining([...roles]));
		expect(xs.attributes.map((a) => a.name)).toContain("SalesOrg"); // $user.SalesOrg in @restrict and the visibility handler
	});

	test("has a role template per role used in the code and by the mock users, each with the SalesOrg attribute", () => {
		const mockRoles = new Set(Object.values(require(path.join(root, ".cdsrc.json")).requires["[development]"].auth.users).flatMap((u) => u.roles));
		const templates = Object.fromEntries(xs["role-templates"].map((t) => [t.name, t]));
		for (const role of [...mockRoles, "MonitorReleaser"]) {
			expect(templates[role]).toBeDefined();
			expect(templates[role]["scope-references"]).toEqual([`$XSAPPNAME.${role}`]);
			expect(templates[role]["attribute-references"]).toEqual(["SalesOrg"]);
		}
	});

	test("every role collection includes MonitorViewer (the service requires it) and only known templates", () => {
		const known = new Set(xs["role-templates"].map((t) => `$XSAPPNAME.${t.name}`));
		for (const collection of xs["role-collections"]) {
			expect(collection["role-template-references"]).toContain("$XSAPPNAME.MonitorViewer");
			expect(collection["role-template-references"].every((r) => known.has(r))).toBe(true);
		}
	});
});
