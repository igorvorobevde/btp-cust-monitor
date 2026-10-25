"use strict";

/**
 * Simulierte Statusmaschine des Kundenmonitors (Phase 1, Mock).
 * Rein funktional, ohne CAP-Abhängigkeit: alle Daten (Customizing, Stammdaten) kommen als Parameter.
 * Fachliche Quelle: docs/01_fachkonzept.md §4–6, Vertrag: docs/03_service_vertrag.md §4–5.
 */
const { StepError, ErrorCodes } = require("./errors");

const TEXT_MAX_LENGTH = 100;
const DESTRUCTIVE_STEPS = new Set(["REJECT", "RESET"]);
const SPECIAL_STEPS = { RESET: "RESET", RELEASE: "RELEASE", CLARIFY: "CLARIFY" };
/** Empfehlungsreihenfolge (W-1): Freigabe, dann Happy-Path-Schritte, dann Dublettenauflösung; Korrekturschritte nie */
const STEP_PRIORITY = ["RELEASE", "CREATE", "CREATE_WE", "AP_MODIFY", "CHNG_OLD", "CNG_DEBI", "CNG_NEW"];

/** Statusgruppe aus dem Statuscode: 0xx/1xx offen, 8xx abgelehnt, 9xx erledigt */
function isOpenStatus(status) {
	return /^[01]/.test(status || "");
}

function isClosedStatus(status) {
	return /^[89]/.test(status || "");
}

/**
 * Bearbeitbar = Status offen, freigegeben und Benutzer ist Editor (03 §2, E-11).
 * @param {{status_code: string, released: boolean}} request
 * @param {boolean} isEditor
 */
function isEditable(request, isEditor) {
	return !!isEditor && !!request.released && isOpenStatus(request.status_code);
}

/**
 * Freigabeprüfung gemäß 01 §4 (Logik ZEC_CUST_APPROV).
 * @param {object} request processType, source, salesOrganization, creditCardPayment, orderVolume
 * @param {object[]} rules ApprovalRules
 * @returns {{released: boolean, releaseProcedure: string|null}}
 */
function checkRelease(request, rules) {
	if (request.processType === "CH_AP") {
		return { released: true, releaseProcedure: "NOT_REL" };
	}
	const rule = rules.find((r) =>
		r.processType === request.processType &&
		r.source === request.source &&
		r.salesOrganization === request.salesOrganization);
	if (!rule) {
		return { released: false, releaseProcedure: null };
	}
	if (rule.notRequired) {
		return { released: true, releaseProcedure: "NOT_REL" };
	}
	const volume = Number(request.orderVolume) || 0;
	const limit = Number(rule.limit) || 0;
	if ((rule.creditCard && request.creditCardPayment) || (volume > 0 && volume <= limit)) {
		return { released: true, releaseProcedure: "AUTOMATIC" };
	}
	return { released: false, releaseProcedure: null };
}

/**
 * Erlaubte Schritte (Logik get_functions, 03 §4).
 * @param {object} request
 * @param {object[]} processSteps ProcessSteps-Customizing
 * @param {{isEditor: boolean, isReleaser: boolean}} roles
 * @returns {string[]} Schrittcodes
 */
function availableStepCodes(request, processSteps, roles) {
	if (!roles.isEditor) {
		return [];
	}
	const status = request.status_code;
	if (isClosedStatus(status)) {
		return [SPECIAL_STEPS.RESET];
	}
	if (!request.released) {
		return roles.isReleaser ? [SPECIAL_STEPS.RELEASE, "REJECT"] : ["REJECT"];
	}
	const codes = [];
	if (status === "000" && !request.inClarification) {
		codes.push(SPECIAL_STEPS.CLARIFY);
	}
	processSteps
		.filter((ps) => ps.source === request.source && ps.processType === request.processType && ps.status === status)
		.forEach((ps) => {
			if (!codes.includes(ps.step)) {
				codes.push(ps.step);
			}
		});
	return codes;
}

/**
 * Empfohlener nächster Schritt (F-24, 03 §4.1): erster erlaubter Schritt in STEP_PRIORITY, sonst null.
 * @param {object} request
 * @param {object[]} processSteps ProcessSteps-Customizing
 * @param {{isEditor: boolean, isReleaser: boolean}} roles
 * @returns {string|null} Schrittcode
 */
function recommendedStep(request, processSteps, roles) {
	const codes = availableStepCodes(request, processSteps, roles);
	return STEP_PRIORITY.find((s) => codes.includes(s)) || null;
}

/**
 * Anreicherung zu StepOption (Eingabeart, Länge, destruktiv) – Reihenfolge: destruktive zuletzt.
 * @param {string[]} codes
 * @param {object[]} steps Steps-Customizing (code, text, input)
 */
function toStepOptions(codes, steps) {
	return codes
		.map((code) => {
			const def = steps.find((s) => s.code === code) || {};
			const input = def.input || "CONFIRM";
			return {
				step: code,
				text: def.text || code,
				input,
				textMaxLength: input === "TEXT" ? TEXT_MAX_LENGTH : null,
				destructive: DESTRUCTIVE_STEPS.has(code)
			};
		})
		.sort((a, b) => Number(a.destructive) - Number(b.destructive));
}

/** Prüft Eingaben je Eingabeart; wirft StepError (400). */
function validateInput(option, params) {
	if (option.input === "TEXT") {
		const text = (params.text || "").trim();
		if (!text) {
			throw new StepError(400, ErrorCodes.INPUT_REQUIRED, "INPUT_REQUIRED_TEXT");
		}
		if (text.length > TEXT_MAX_LENGTH) {
			throw new StepError(400, ErrorCodes.INPUT_TOO_LONG, "INPUT_TOO_LONG", [TEXT_MAX_LENGTH]);
		}
	}
	if (option.input === "BUSINESS_PARTNER") {
		const bp = (params.businessPartner || "").trim();
		if (!bp) {
			throw new StepError(400, ErrorCodes.INPUT_REQUIRED, "INPUT_REQUIRED_BP");
		}
		if (!/^\d{1,10}$/.test(bp)) {
			throw new StepError(400, ErrorCodes.BP_NOT_FOUND, "BP_NOT_FOUND", [bp]);
		}
	}
}

/** BP-Nummer ohne führende Nullen (Mock-Stammdaten sind ohne Nullen gespeichert). */
function normalizeBp(bp) {
	return String(bp || "").trim().replace(/^0+/, "");
}

// Zustandsfelder, deren Änderung die Wartezeit neu startet (F-24)
const STATE_FIELDS = ["status_code", "inClarification", "released"];

/**
 * Ändert der Schritt den Zustand (Status, Klärung, Freigabe)? Felder ohne Änderungseintrag zählen nicht.
 *
 * @param {object} request aktueller Vorgang
 * @param {object} changes requestChanges des Schritts
 * @returns {boolean}
 */
function stateChanged(request, changes) {
	return STATE_FIELDS.some((f) => f in changes && changes[f] !== request[f]);
}

function containsErrorMarker(...names) {
	return names.some((n) => /FEHLER/i.test(n || ""));
}

/**
 * Führt einen Schritt aus (Simulation).
 *
 * @param {string} step Schrittcode
 * @param {object} request aktueller Vorgang inkl. admin, shipTo
 * @param {{businessPartner?: string, text?: string, force?: boolean}} params
 * @param {object} ctx
 * @param {object[]} ctx.processSteps
 * @param {object[]} ctx.steps
 * @param {object[]} ctx.approvalRules
 * @param {(bp: string) => object|undefined} ctx.findBusinessPartner
 * @param {(customer: string) => object|undefined} ctx.findBusinessPartnerByCustomer
 * @param {(kind: "customer"|"businessPartner"|"contactPerson"|"shipTo") => string} ctx.newNumber
 * @param {{isEditor: boolean, isReleaser: boolean}} ctx.roles
 * @param {string} ctx.user
 * @param {string} ctx.now ISO-Zeitstempel
 * @returns {{requestChanges: object, adminChanges: object, shipToChanges: object,
 *            messages: Array<{type: string, key: string, args: Array}>, failed: boolean}}
 *          `failed` = Schritt ausgeführt, aber Fehlerstatus gesetzt (HTTP 200).
 * @throws {StepError} bei Ablehnung ohne Statusänderung
 */
function executeStep(step, request, params, ctx) {
	const allowed = availableStepCodes(request, ctx.processSteps, ctx.roles);
	if (!allowed.includes(step)) {
		throw new StepError(400, ErrorCodes.STEP_NOT_ALLOWED, "STEP_NOT_ALLOWED", [step]);
	}
	const [option] = toStepOptions([step], ctx.steps);
	validateInput(option, params);

	const def = ctx.steps.find((s) => s.code === step) || {};
	const result = { requestChanges: {}, adminChanges: {}, shipToChanges: {}, messages: [], failed: false };
	const rc = result.requestChanges;
	const msg = (type, key, args = []) => result.messages.push({ type, key, args });
	const text = (params.text || "").trim();

	switch (step) {
		case "RELEASE":
			Object.assign(rc, { released: true, releaseProcedure: "MANUAL", releasedBy: ctx.user, releasedAt: ctx.now });
			msg("S", "LOG_RELEASED", [ctx.user]);
			break;

		case "CLARIFY":
			Object.assign(rc, { inClarification: true, clarificationComment: text });
			msg("I", "LOG_CLARIFY", [text]);
			break;

		case "REJECT":
			rc.status_code = def.successStatus || "899";
			msg("S", "LOG_REJECTED", [text]);
			break;

		case "MANUAL_OK":
			rc.status_code = def.successStatus || "998";
			msg("S", "LOG_MANUAL_OK");
			break;

		case "RESET": {
			// 01 §6.3: Sonderfall abgelehnter CR_DEB ohne Debitor → CR_DEB/120
			if (request.processType === "CR_DEB" && /^8/.test(request.status_code) && !request.customer) {
				Object.assign(rc, { processType: "CR_DEB", status_code: "120" });
			} else if (request.processType === "CR_DEB") {
				Object.assign(rc, { processType: "CH_DEB", status_code: "000" });
			} else if (request.processType === "CR_WE") {
				rc.status_code = "010";
			} else {
				rc.status_code = "000";
			}
			msg("S", "LOG_RESET");
			break;
		}

		case "CNG_NEW": {
			Object.assign(rc, {
				customer: null,
				businessPartner: null,
				contactPersonNumber: null,
				processType: "CR_DEB",
				status_code: def.successStatus || "120"
			});
			result.adminChanges.contactPersonNumber = null;
			// R-02: Freigabe nach Prozessartwechsel neu prüfen
			const release = checkRelease({ ...request, processType: "CR_DEB" }, ctx.approvalRules);
			Object.assign(rc, release, release.released ? {} : { releasedBy: null, releasedAt: null });
			msg("S", "LOG_CNG_NEW");
			msg(release.released ? "S" : "W", release.released ? "LOG_RELEASE_OK" : "LOG_RELEASE_REQUIRED");
			break;
		}

		case "CHNG_OLD":
		case "CNG_DEBI": {
			const bpNo = normalizeBp(params.businessPartner);
			const bp = ctx.findBusinessPartner(bpNo);
			if (!bp) {
				throw new StepError(400, ErrorCodes.BP_NOT_FOUND, "BP_NOT_FOUND", [bpNo]);
			}
			// R-06: BP ohne Debitorrolle ablehnen
			if (!bp.hasCustomerRole || !bp.customer) {
				throw new StepError(400, ErrorCodes.BP_NOT_CUSTOMER, "BP_NOT_CUSTOMER", [bpNo]);
			}
			// R-06: bestehende Magento-Zuordnung für beide Schritte prüfen
			if (bp.magentoCompany && bp.magentoCompany !== request.magentoCompany && !params.force) {
				throw new StepError(409, ErrorCodes.CONFIRM_REQUIRED, "CONFIRM_REQUIRED_MAGENTO", [bp.customer, bp.magentoCompany]);
			}
			Object.assign(rc, {
				businessPartner: bp.businessPartner,
				customer: bp.customer,
				processType: "CH_DEB",
				status_code: def.successStatus
			});
			if (step === "CNG_DEBI") {
				rc.contactPersonNumber = null;
				result.adminChanges.contactPersonNumber = null;
			}
			msg("S", "LOG_BP_ASSIGNED", [bp.businessPartner, bp.customer]);
			break;
		}

		case "CREATE": {
			if (containsErrorMarker(request.name)) {
				rc.status_code = def.errorStatus || "150";
				result.failed = true;
				msg("E", "LOG_CREATE_FAILED", [request.name]);
				break;
			}
			const customer = request.customer || ctx.newNumber("customer");
			const businessPartner = request.businessPartner || ctx.newNumber("businessPartner");
			const contactPersonNumber = request.contactPersonNumber || ctx.newNumber("contactPerson");
			Object.assign(rc, { customer, businessPartner, contactPersonNumber, status_code: def.successStatus || "999" });
			result.adminChanges.contactPersonNumber = contactPersonNumber;
			msg("S", "LOG_CUSTOMER_CREATED", [customer, businessPartner]);
			msg("S", "LOG_CONTACT_CREATED", [contactPersonNumber]);
			break;
		}

		case "AP_MODIFY": {
			// 01 §6.4: VKORG 2000 → CRM-Nummer am Debitor Pflicht (Meldung 058), harter Abbruch (R-04: ins Log)
			if (request.salesOrganization === "2000") {
				const bp = ctx.findBusinessPartnerByCustomer(request.customer);
				if (!bp || !bp.crmNumber) {
					throw new StepError(422, ErrorCodes.STEP_ABORTED, "STEP_ABORTED_CRM", [request.customer || ""], { logEntry: true, step });
				}
			}
			const adminName = request.admin ? request.admin.lastName : "";
			if (containsErrorMarker(request.name, adminName)) {
				rc.status_code = def.errorStatus || "140";
				result.failed = true;
				msg("E", "LOG_CONTACT_FAILED");
				break;
			}
			const existing = request.contactPersonNumber || (request.admin && request.admin.contactPersonNumber);
			const contactPersonNumber = existing || ctx.newNumber("contactPerson");
			Object.assign(rc, { contactPersonNumber, status_code: def.successStatus || "999" });
			result.adminChanges.contactPersonNumber = contactPersonNumber;
			msg("S", existing ? "LOG_CONTACT_CHANGED" : "LOG_CONTACT_CREATED", [contactPersonNumber]);
			break;
		}

		case "CREATE_WE": {
			const shipToName = request.shipTo ? request.shipTo.name : "";
			if (containsErrorMarker(request.name, shipToName)) {
				rc.status_code = def.errorStatus || "160";
				result.failed = true;
				msg("E", "LOG_SHIPTO_FAILED");
				break;
			}
			// R-11: gespeicherte WE-Nummer wiederverwenden
			const shipToCustomer = request.shipToCustomer || ctx.newNumber("shipTo");
			Object.assign(rc, { shipToCustomer, status_code: def.successStatus || "999" });
			result.shipToChanges.shipToCustomer = shipToCustomer;
			msg("S", "LOG_SHIPTO_CREATED", [shipToCustomer, request.customer || ""]);
			break;
		}

		default:
			throw new StepError(400, ErrorCodes.STEP_NOT_ALLOWED, "STEP_NOT_ALLOWED", [step]);
	}
	if (stateChanged(request, rc)) {
		rc.waitingSince = ctx.now;
	}
	return result;
}

module.exports = {
	TEXT_MAX_LENGTH,
	isOpenStatus,
	isClosedStatus,
	isEditable,
	checkRelease,
	availableStepCodes,
	recommendedStep,
	toStepOptions,
	validateInput,
	normalizeBp,
	stateChanged,
	executeStep
};
