/* global QUnit */
sap.ui.define([
	"hydac/custmon/util/FilterBuilder"
], function (FilterBuilder) {
	"use strict";

	function state(oOverrides) {
		return Object.assign(FilterBuilder.getDefaultState(), oOverrides);
	}

	function find(aFilters, sPath) {
		return aFilters.find((oFilter) => oFilter.getPath() === sPath);
	}

	QUnit.module("FilterBuilder");

	QUnit.test("default excludes rejected and completed", function (assert) {
		const aFilters = FilterBuilder.build(FilterBuilder.getDefaultState());
		assert.strictEqual(aFilters.length, 1);
		assert.strictEqual(aFilters[0].getPath(), "status_code");
		assert.strictEqual(aFilters[0].getOperator(), "LT");
		assert.strictEqual(aFilters[0].getValue1(), "800");
	});

	QUnit.test("include rejected / done / both", function (assert) {
		const oRejected = FilterBuilder.build(state({ includeRejected: true }))[0];
		assert.strictEqual(oRejected.getValue1(), "900", "only 9xx excluded");

		const oDone = FilterBuilder.build(state({ includeDone: true }))[0];
		assert.strictEqual(oDone.getFilters().length, 2, "OR of <800 and >=900");
		assert.notOk(oDone.isAnd());

		assert.strictEqual(FilterBuilder.build(state({ includeDone: true, includeRejected: true })).length, 0);
	});

	QUnit.test("explicit status selection overrides group checkboxes", function (assert) {
		const oFilter = FilterBuilder.build(state({ statuses: ["899", "999"] }))[0];
		assert.deepEqual(oFilter.getFilters().map((f) => f.getValue1()), ["899", "999"]);
	});

	QUnit.test("search uses case-insensitive contains on name, name2, magentoCompany", function (assert) {
		const aFilters = FilterBuilder.build(state({ search: " müller " }));
		const oSearch = aFilters.find((f) => f.getFilters() && f.getFilters()[0].getOperator() === "Contains");
		assert.deepEqual(oSearch.getFilters().map((f) => f.getPath()), ["name", "name2", "magentoCompany"]);
		assert.strictEqual(oSearch.getFilters()[0].getValue1(), "müller");
		assert.strictEqual(oSearch.getFilters()[0].isCaseSensitive(), false);
	});

	QUnit.test("multi-value and simple filters", function (assert) {
		const aFilters = FilterBuilder.build(state({
			customer: "4000004",
			processTypes: ["CR_WE"],
			salesOrganizations: ["0001", "7050"],
			orderExists: "NO",
			onlyUnreleased: true,
			onlyClarification: true,
			createdBy: "magento.interface"
		}));
		assert.strictEqual(find(aFilters, "customer").getValue1(), "4000004");
		assert.strictEqual(find(aFilters, "processType").getValue1(), "CR_WE");
		assert.strictEqual(find(aFilters, "orderExists").getValue1(), false);
		assert.strictEqual(find(aFilters, "released").getValue1(), false);
		assert.strictEqual(find(aFilters, "inClarification").getValue1(), true);
		assert.strictEqual(find(aFilters, "createdBy").getValue1(), "magento.interface");
		const oOrgs = aFilters.find((f) => f.getFilters() && f.getFilters()[0].getPath() === "salesOrganization");
		assert.strictEqual(oOrgs.getFilters().length, 2);
	});

	QUnit.test("date range covers whole days", function (assert) {
		const aFilters = FilterBuilder.build(state({ createdFrom: new Date(2026, 9, 1), createdTo: new Date(2026, 9, 2) }));
		const aCreated = aFilters.filter((f) => f.getPath() === "createdAt");
		assert.strictEqual(aCreated.length, 2);
		assert.strictEqual(aCreated[0].getOperator(), "GE");
		assert.strictEqual(new Date(aCreated[0].getValue1()).getTime(), new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
		assert.strictEqual(new Date(aCreated[1].getValue1()).getTime(), new Date(2026, 9, 2, 23, 59, 59, 999).getTime());
	});
});
