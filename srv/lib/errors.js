"use strict";

/**
 * Fachlicher Fehler eines Schritts gemäß 03 §5.1.
 * `messageKey` verweist auf _i18n/messages*.properties und wird im Service übersetzt.
 */
class StepError extends Error {
	/**
	 * @param {number} status HTTP-Status (400, 409, 412, 422 …)
	 * @param {string} code Fehlercode (STEP_NOT_ALLOWED, CONFIRM_REQUIRED, …) oder null
	 * @param {string} messageKey i18n-Schlüssel
	 * @param {Array<string|number>} [args] Platzhalter
	 * @param {object} [options] { logEntry: true } → Meldung auch ins Protokoll (R-04)
	 */
	constructor(status, code, messageKey, args = [], options = {}) {
		super(messageKey);
		this.status = status;
		this.code = code;
		this.messageKey = messageKey;
		this.args = args;
		this.logEntry = !!options.logEntry;
		this.step = options.step;
	}
}

const ErrorCodes = Object.freeze({
	STEP_NOT_ALLOWED: "STEP_NOT_ALLOWED",
	INPUT_REQUIRED: "INPUT_REQUIRED",
	INPUT_TOO_LONG: "INPUT_TOO_LONG",
	BP_NOT_FOUND: "BP_NOT_FOUND",
	BP_NOT_CUSTOMER: "BP_NOT_CUSTOMER",
	CONFIRM_REQUIRED: "CONFIRM_REQUIRED",
	STEP_ABORTED: "STEP_ABORTED",
	NOT_EDITABLE: "NOT_EDITABLE",
	DRAFT_CHANGED_MEANWHILE: "DRAFT_CHANGED_MEANWHILE",
	VIRTUAL_NOT_QUERYABLE: "VIRTUAL_NOT_QUERYABLE"
});

module.exports = { StepError, ErrorCodes };
