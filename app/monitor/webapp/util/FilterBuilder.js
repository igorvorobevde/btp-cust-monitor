sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
	"use strict";

	/** Default-Filterzustand der Liste (04 §2.1) */
	function getDefaultState() {
		return {
			search: "",
			customer: "",
			salesOrganizations: [],
			processTypes: [],
			statuses: [],
			sources: [],
			orderExists: "ALL",
			createdFrom: null,
			createdTo: null,
			createdBy: "",
			modifiedBy: "",
			modifiedFrom: null,
			modifiedTo: null,
			includeDone: false,
			includeRejected: false,
			onlyUnreleased: false,
			onlyClarification: false
		};
	}

	function anyOf(sPath, aValues) {
		if (!aValues || !aValues.length) {
			return null;
		}
		const aFilters = aValues.map((v) => new Filter(sPath, FilterOperator.EQ, v));
		return aFilters.length === 1 ? aFilters[0] : new Filter({ filters: aFilters, and: false });
	}

	function startOfDay(oDate) {
		const d = new Date(oDate);
		d.setHours(0, 0, 0, 0);
		return d.toISOString();
	}

	function endOfDay(oDate) {
		const d = new Date(oDate);
		d.setHours(23, 59, 59, 999);
		return d.toISOString();
	}

	function dateRange(sPath, oFrom, oTo) {
		const aFilters = [];
		if (oFrom) {
			aFilters.push(new Filter(sPath, FilterOperator.GE, startOfDay(oFrom)));
		}
		if (oFrom || oTo) {
			aFilters.push(new Filter(sPath, FilterOperator.LE, endOfDay(oTo || oFrom)));
		}
		return aFilters;
	}

	/**
	 * Statusgruppen-Ausschluss: ohne Haken keine 9xx (erledigt) bzw. 8xx (abgelehnt).
	 * Ist im Status-Filter explizit etwas gewählt, gilt nur diese Auswahl.
	 */
	function statusFilter(oState) {
		if (oState.statuses && oState.statuses.length) {
			return anyOf("status_code", oState.statuses);
		}
		if (oState.includeDone && oState.includeRejected) {
			return null;
		}
		if (oState.includeRejected) {
			return new Filter("status_code", FilterOperator.LT, "900");
		}
		if (oState.includeDone) {
			return new Filter({
				filters: [
					new Filter("status_code", FilterOperator.LT, "800"),
					new Filter("status_code", FilterOperator.GE, "900")
				],
				and: false
			});
		}
		return new Filter("status_code", FilterOperator.LT, "800");
	}

	return {
		getDefaultState: getDefaultState,

		/**
		 * Filterzustand → Filter für die Requests-Liste (04 §2.1).
		 * @param {object} oState Filterzustand (siehe getDefaultState)
		 * @returns {sap.ui.model.Filter[]} UND-verknüpfte Filter
		 */
		build: function (oState) {
			const aFilters = [];
			const sSearch = (oState.search || "").trim();
			if (sSearch) {
				aFilters.push(new Filter({
					filters: ["name", "name2", "magentoCompany"].map((sPath) => new Filter({
						path: sPath,
						operator: FilterOperator.Contains,
						value1: sSearch,
						caseSensitive: false
					})),
					and: false
				}));
			}
			if ((oState.customer || "").trim()) {
				aFilters.push(new Filter("customer", FilterOperator.EQ, oState.customer.trim()));
			}
			[
				anyOf("salesOrganization", oState.salesOrganizations),
				anyOf("processType", oState.processTypes),
				anyOf("source", oState.sources),
				statusFilter(oState)
			].forEach((oFilter) => oFilter && aFilters.push(oFilter));

			if (oState.orderExists === "YES" || oState.orderExists === "NO") {
				aFilters.push(new Filter("orderExists", FilterOperator.EQ, oState.orderExists === "YES"));
			}
			aFilters.push(...dateRange("createdAt", oState.createdFrom, oState.createdTo));
			aFilters.push(...dateRange("modifiedAt", oState.modifiedFrom, oState.modifiedTo));
			if ((oState.createdBy || "").trim()) {
				aFilters.push(new Filter("createdBy", FilterOperator.EQ, oState.createdBy.trim()));
			}
			if ((oState.modifiedBy || "").trim()) {
				aFilters.push(new Filter("modifiedBy", FilterOperator.EQ, oState.modifiedBy.trim()));
			}
			if (oState.onlyUnreleased) {
				aFilters.push(new Filter("released", FilterOperator.EQ, false));
			}
			if (oState.onlyClarification) {
				aFilters.push(new Filter("inClarification", FilterOperator.EQ, true));
			}
			return aFilters;
		}
	};
});
