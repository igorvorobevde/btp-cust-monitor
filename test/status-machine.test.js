"use strict";

const sm = require("../srv/lib/status-machine");
const { StepError } = require("../srv/lib/errors");

const processSteps = [
	["CR_DEB", "000", ["CREATE", "CHNG_OLD", "MANUAL_OK", "REJECT"]],
	["CR_DEB", "150", ["CREATE", "MANUAL_OK", "REJECT"]],
	["CH_DEB", "000", ["AP_MODIFY", "CNG_DEBI", "CNG_NEW", "MANUAL_OK", "REJECT"]],
	["CR_WE", "010", ["CREATE_WE", "MANUAL_OK"]]
].flatMap(([processType, status, steps]) => steps.map((step) => ({ source: "SHOP", processType, status, step })));

const steps = [
	{ code: "CREATE", successStatus: "999", errorStatus: "150", input: "CONFIRM", text: "Create" },
	{ code: "REJECT", successStatus: "899", input: "TEXT", text: "Reject" },
	{ code: "RESET", input: "CONFIRM", text: "Reset" },
	{ code: "CLARIFY", input: "TEXT", text: "Clarify" },
	{ code: "CNG_NEW", successStatus: "120", input: "CONFIRM", text: "New" },
	{ code: "CNG_DEBI", successStatus: "110", input: "BUSINESS_PARTNER", text: "Change" },
	{ code: "CHNG_OLD", successStatus: "130", input: "BUSINESS_PARTNER", text: "Duplicate" }
];

const approvalRules = [
	{ processType: "CR_DEB", source: "SHOP", salesOrganization: "0001", limit: 5000, creditCard: true, notRequired: false },
	{ processType: "CR_DEB", source: "SHOP", salesOrganization: "2000", notRequired: true }
];

const editor = { isEditor: true, isReleaser: true };
const ctx = (overrides = {}) => ({
	processSteps,
	steps,
	approvalRules,
	findBusinessPartner: () => undefined,
	findBusinessPartnerByCustomer: () => undefined,
	newNumber: (kind) => ({ customer: "41000001", businessPartner: "11000001", contactPerson: "0100000001", shipTo: "42000001" })[kind],
	roles: editor,
	user: "alice",
	now: "2026-10-19T10:00:00.000Z",
	...overrides
});
const request = (o = {}) => ({ source: "SHOP", processType: "CR_DEB", status_code: "000", released: true, inClarification: false, name: "ACME", ...o });

describe("availableStepCodes", () => {
	test("closed status offers only RESET", () => {
		expect(sm.availableStepCodes(request({ status_code: "999" }), processSteps, editor)).toEqual(["RESET"]);
		expect(sm.availableStepCodes(request({ status_code: "899" }), processSteps, editor)).toEqual(["RESET"]);
	});

	test("not released offers RELEASE + REJECT, RELEASE only for releaser", () => {
		expect(sm.availableStepCodes(request({ released: false }), processSteps, editor)).toEqual(["RELEASE", "REJECT"]);
		expect(sm.availableStepCodes(request({ released: false }), processSteps, { isEditor: true, isReleaser: false })).toEqual(["REJECT"]);
	});

	test("status 000 adds CLARIFY unless already in clarification", () => {
		expect(sm.availableStepCodes(request(), processSteps, editor)).toEqual(["CLARIFY", "CREATE", "CHNG_OLD", "MANUAL_OK", "REJECT"]);
		expect(sm.availableStepCodes(request({ inClarification: true }), processSteps, editor)).not.toContain("CLARIFY");
	});

	test("viewer gets no steps", () => {
		expect(sm.availableStepCodes(request(), processSteps, { isEditor: false, isReleaser: false })).toEqual([]);
	});
});

describe("toStepOptions", () => {
	test("destructive steps last, TEXT has max length", () => {
		const options = sm.toStepOptions(["REJECT", "CREATE", "CLARIFY"], steps);
		expect(options.map((o) => o.step)).toEqual(["CREATE", "CLARIFY", "REJECT"]);
		expect(options[2]).toMatchObject({ destructive: true, input: "TEXT", textMaxLength: 100 });
		expect(options[0]).toMatchObject({ destructive: false, input: "CONFIRM", textMaxLength: null });
	});
});

describe("checkRelease", () => {
	test("CH_AP always released", () => {
		expect(sm.checkRelease({ processType: "CH_AP" }, [])).toEqual({ released: true, releaseProcedure: "NOT_REL" });
	});
	test("no rule → not released", () => {
		expect(sm.checkRelease({ processType: "CR_DEB", source: "SHOP", salesOrganization: "7020" }, approvalRules).released).toBe(false);
	});
	test("credit card or volume within limit → automatic", () => {
		const base = { processType: "CR_DEB", source: "SHOP", salesOrganization: "0001" };
		expect(sm.checkRelease({ ...base, creditCardPayment: true }, approvalRules).releaseProcedure).toBe("AUTOMATIC");
		expect(sm.checkRelease({ ...base, orderVolume: 5000 }, approvalRules).releaseProcedure).toBe("AUTOMATIC");
		expect(sm.checkRelease({ ...base, orderVolume: 5000.01 }, approvalRules).released).toBe(false);
		expect(sm.checkRelease({ ...base, orderVolume: 0 }, approvalRules).released).toBe(false);
	});
	test("notRequired → NOT_REL", () => {
		expect(sm.checkRelease({ processType: "CR_DEB", source: "SHOP", salesOrganization: "2000" }, approvalRules).releaseProcedure).toBe("NOT_REL");
	});
});

describe("executeStep", () => {
	test("step not allowed → 400 STEP_NOT_ALLOWED", () => {
		expect(() => sm.executeStep("CREATE_WE", request(), {}, ctx())).toThrow(expect.objectContaining({ status: 400, code: "STEP_NOT_ALLOWED" }));
	});

	test("TEXT input required and limited", () => {
		expect(() => sm.executeStep("REJECT", request(), { text: "  " }, ctx())).toThrow(expect.objectContaining({ code: "INPUT_REQUIRED" }));
		expect(() => sm.executeStep("REJECT", request(), { text: "x".repeat(101) }, ctx())).toThrow(expect.objectContaining({ code: "INPUT_TOO_LONG" }));
	});

	test("CREATE with FEHLER sets error status and flags failure", () => {
		const result = sm.executeStep("CREATE", request({ name: "FEHLER GmbH" }), {}, ctx());
		expect(result.failed).toBe(true);
		expect(result.requestChanges.status_code).toBe("150");
	});

	test("CREATE assigns new numbers and completes", () => {
		const result = sm.executeStep("CREATE", request(), {}, ctx());
		expect(result.requestChanges).toMatchObject({ customer: "41000001", businessPartner: "11000001", status_code: "999" });
	});

	test("RESET of rejected CR_DEB without customer → CR_DEB/120", () => {
		const result = sm.executeStep("RESET", request({ status_code: "899", customer: null }), {}, ctx());
		expect(result.requestChanges).toEqual({ processType: "CR_DEB", status_code: "120", waitingSince: "2026-10-19T10:00:00.000Z" });
	});

	test("RESET of completed CR_DEB → CH_DEB/000, CR_WE → 010", () => {
		expect(sm.executeStep("RESET", request({ status_code: "999", customer: "4711" }), {}, ctx()).requestChanges)
			.toEqual({ processType: "CH_DEB", status_code: "000", waitingSince: "2026-10-19T10:00:00.000Z" });
		expect(sm.executeStep("RESET", request({ processType: "CR_WE", status_code: "999" }), {}, ctx()).requestChanges)
			.toEqual({ status_code: "010", waitingSince: "2026-10-19T10:00:00.000Z" });
	});

	test("CNG_NEW re-checks release (R-02)", () => {
		const result = sm.executeStep("CNG_NEW", request({ processType: "CH_DEB", salesOrganization: "0001", orderVolume: 9000 }), {}, ctx());
		expect(result.requestChanges).toMatchObject({ processType: "CR_DEB", status_code: "120", released: false });
	});

	test("CNG_DEBI: BP checks and CONFIRM_REQUIRED (R-06)", () => {
		const partners = {
			"1": { businessPartner: "1", customer: "4001", hasCustomerRole: true, magentoCompany: "999" },
			"2": { businessPartner: "2", customer: "", hasCustomerRole: false }
		};
		const c = ctx({ findBusinessPartner: (bp) => partners[bp] });
		const ch = request({ processType: "CH_DEB", magentoCompany: "MC1" });
		expect(() => sm.executeStep("CNG_DEBI", ch, { businessPartner: "77" }, c)).toThrow(expect.objectContaining({ code: "BP_NOT_FOUND" }));
		expect(() => sm.executeStep("CNG_DEBI", ch, { businessPartner: "0000000002" }, c)).toThrow(expect.objectContaining({ code: "BP_NOT_CUSTOMER" }));
		expect(() => sm.executeStep("CNG_DEBI", ch, { businessPartner: "1" }, c)).toThrow(expect.objectContaining({ status: 409, code: "CONFIRM_REQUIRED" }));
		expect(() => sm.executeStep("CHNG_OLD", request({ magentoCompany: "MC1" }), { businessPartner: "1" }, c)).toThrow(expect.objectContaining({ code: "CONFIRM_REQUIRED" }));
		const forced = sm.executeStep("CNG_DEBI", ch, { businessPartner: "1", force: true }, c);
		expect(forced.requestChanges).toMatchObject({ customer: "4001", processType: "CH_DEB", status_code: "110", contactPersonNumber: null });
	});

	test("AP_MODIFY in VKORG 2000 without CRM number → 422 STEP_ABORTED with log flag", () => {
		const c = ctx({ findBusinessPartnerByCustomer: () => ({ crmNumber: "" }) });
		let error;
		try {
			sm.executeStep("AP_MODIFY", request({ processType: "CH_DEB", salesOrganization: "2000", customer: "4000004" }), {}, c);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(StepError);
		expect(error).toMatchObject({ status: 422, code: "STEP_ABORTED", logEntry: true });
	});
});

describe("waitingSince", () => {
	test("RELEASE and CLARIFY set waitingSince to now", () => {
		expect(sm.executeStep("RELEASE", request({ released: false }), {}, ctx()).requestChanges.waitingSince).toBe("2026-10-19T10:00:00.000Z");
		expect(sm.executeStep("CLARIFY", request(), { text: "x" }, ctx()).requestChanges.waitingSince).toBe("2026-10-19T10:00:00.000Z");
	});
	test("a failing CREATE on status 150 keeps waitingSince (no state change)", () => {
		const result = sm.executeStep("CREATE", request({ status_code: "150", name: "FEHLER AG" }), {}, ctx());
		expect(result.failed).toBe(true);
		expect(result.requestChanges.waitingSince).toBeUndefined();
	});
	test("stateChanged compares only status, clarification and release", () => {
		expect(sm.stateChanged(request(), { customer: "1" })).toBe(false);
		expect(sm.stateChanged(request(), { status_code: "000" })).toBe(false);
		expect(sm.stateChanged(request(), { status_code: "999" })).toBe(true);
	});
});

describe("recommendedStep", () => {
	test("happy path first: CREATE for CR_DEB 000, AP_MODIFY for CH_DEB 000, CREATE_WE for CR_WE 010, CREATE again on 150", () => {
		expect(sm.recommendedStep(request(), processSteps, editor)).toBe("CREATE");
		expect(sm.recommendedStep(request({ processType: "CH_DEB" }), processSteps, editor)).toBe("AP_MODIFY");
		expect(sm.recommendedStep(request({ processType: "CR_WE", status_code: "010" }), processSteps, editor)).toBe("CREATE_WE");
		expect(sm.recommendedStep(request({ status_code: "150" }), processSteps, editor)).toBe("CREATE");
	});
	test("release first; nothing for non-releasers, viewers, closed requests or correction-only customizing", () => {
		expect(sm.recommendedStep(request({ released: false }), processSteps, editor)).toBe("RELEASE");
		expect(sm.recommendedStep(request({ released: false }), processSteps, { isEditor: true, isReleaser: false })).toBeNull();
		expect(sm.recommendedStep(request(), processSteps, { isEditor: false, isReleaser: false })).toBeNull();
		expect(sm.recommendedStep(request({ status_code: "999" }), processSteps, editor)).toBeNull();
		const onlyCorrections = [{ source: "SHOP", processType: "CR_DEB", status: "000", step: "MANUAL_OK" }, { source: "SHOP", processType: "CR_DEB", status: "000", step: "REJECT" }];
		expect(sm.recommendedStep(request({ inClarification: true }), onlyCorrections, editor)).toBeNull();
		const duplicateOnly = [{ source: "SHOP", processType: "CR_DEB", status: "000", step: "CHNG_OLD" }, ...onlyCorrections];
		expect(sm.recommendedStep(request(), duplicateOnly, editor)).toBe("CHNG_OLD");
	});
});
