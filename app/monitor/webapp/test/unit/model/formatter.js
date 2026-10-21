/* global QUnit */
sap.ui.define([
	"hydac/custmon/model/formatter"
], function (formatter) {
	"use strict";

	QUnit.module("formatter");

	QUnit.test("statusState / statusIcon map service groups (04 §5)", function (assert) {
		assert.strictEqual(formatter.statusState("OPEN"), "Information");
		assert.strictEqual(formatter.statusState("ERROR"), "Error");
		assert.strictEqual(formatter.statusState("REJECTED"), "None");
		assert.strictEqual(formatter.statusState("DONE"), "Success");
		assert.strictEqual(formatter.statusState("UNKNOWN"), "None");
		assert.strictEqual(formatter.statusIcon("OPEN"), "sap-icon://pending");
		assert.strictEqual(formatter.statusIcon("ERROR"), "sap-icon://error");
		assert.strictEqual(formatter.statusIcon("REJECTED"), "sap-icon://decline");
		assert.strictEqual(formatter.statusIcon("DONE"), "sap-icon://complete");
		assert.strictEqual(formatter.statusIcon(undefined), "");
	});

	QUnit.test("statusText / statusGroup read the service code list", function (assert) {
		const mStatuses = { "899": { text: "Abgelehnt", group: "REJECTED" } };
		assert.strictEqual(formatter.statusText("899", mStatuses), "Abgelehnt");
		assert.strictEqual(formatter.statusGroup("899", mStatuses), "REJECTED");
		assert.strictEqual(formatter.statusText("123", mStatuses), "123");
		assert.strictEqual(formatter.statusGroup("123", {}), "");
	});

	QUnit.test("processTypeText falls back to code", function (assert) {
		assert.strictEqual(formatter.processTypeText("CR_WE", { CR_WE: "Neuer Warenempfänger" }), "Neuer Warenempfänger");
		assert.strictEqual(formatter.processTypeText("CR_WE", {}), "CR_WE");
		assert.strictEqual(formatter.processTypeText(null, null), "");
	});

	QUnit.test("releaseText / releaseState", function (assert) {
		const aTexts = ["auto", "manual", "notReq", "notRel"];
		assert.strictEqual(formatter.releaseText(false, null, ...aTexts), "notRel");
		assert.strictEqual(formatter.releaseText(true, "AUTOMATIC", ...aTexts), "auto");
		assert.strictEqual(formatter.releaseText(true, "MANUAL", ...aTexts), "manual");
		assert.strictEqual(formatter.releaseText(true, "NOT_REL", ...aTexts), "notReq");
		assert.strictEqual(formatter.releaseState(true), "Success");
		assert.strictEqual(formatter.releaseState(false), "Warning");
	});

	QUnit.test("rowHighlight / log type", function (assert) {
		assert.strictEqual(formatter.rowHighlight(true), "Information");
		assert.strictEqual(formatter.rowHighlight(false), "None");
		assert.strictEqual(formatter.logTypeColor("E"), "Negative");
		assert.strictEqual(formatter.logTypeColor("A"), "Negative");
		assert.strictEqual(formatter.logTypeColor("W"), "Critical");
		assert.strictEqual(formatter.logTypeColor("S"), "Positive");
		assert.strictEqual(formatter.logTypeColor("?"), "Default");
		assert.strictEqual(formatter.logTypeIcon("E"), "sap-icon://message-error");
	});

	QUnit.test("formatMessage replaces placeholders", function (assert) {
		assert.strictEqual(formatter.formatMessage("Requests ({0})", 7), "Requests (7)");
	});
});
