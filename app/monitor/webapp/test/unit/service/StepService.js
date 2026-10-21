/* global QUnit */
sap.ui.define([
	"hydac/custmon/service/StepService"
], function (StepService) {
	"use strict";

	function error(iStatus, sCode, sMessage) {
		const oError = new Error("HTTP " + iStatus);
		oError.status = iStatus;
		oError.error = { code: sCode, message: sMessage };
		return oError;
	}

	QUnit.module("StepService.mapError");

	QUnit.test("412 → conflict", function (assert) {
		assert.strictEqual(StepService.mapError(error(412, "412", "changed")).outcome, "conflict");
	});

	QUnit.test("409 CONFIRM_REQUIRED → confirm with question", function (assert) {
		const oResult = StepService.mapError(error(409, "CONFIRM_REQUIRED", "Trotzdem übernehmen?"));
		assert.strictEqual(oResult.outcome, "confirm");
		assert.strictEqual(oResult.message, "Trotzdem übernehmen?");
	});

	QUnit.test("other 4xx → error with server message and code", function (assert) {
		const oAborted = StepService.mapError(error(422, "STEP_ABORTED", "Abgebrochen"));
		assert.deepEqual([oAborted.outcome, oAborted.code, oAborted.message], ["error", "STEP_ABORTED", "Abgebrochen"]);
		assert.strictEqual(StepService.mapError(error(409, "NOT_EDITABLE", "x")).outcome, "error");
		assert.strictEqual(StepService.mapError(error(400, "BP_NOT_FOUND", "x")).outcome, "error");
	});

	QUnit.test("network error without body → error with error message", function (assert) {
		const oResult = StepService.mapError(new Error("Network error"));
		assert.strictEqual(oResult.outcome, "error");
		assert.strictEqual(oResult.message, "Network error");
	});
});
