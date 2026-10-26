sap.ui.define([
	"sap/fe/test/ListReport",
	"sap/ui/test/Opa5"
], function (ListReport, Opa5) {
	"use strict";

	// List Report page object (FE component id from manifest routing targets) + app-specific assertions (priority sort)
	return new ListReport({
		appId: "hydac.custmon",
		componentId: "RequestsList",
		entitySet: "Requests"
	}, {
		actions: {},
		assertions: {
			iSeeErrorsFirst: function () {
				// priority 1 ⇔ status.group ERROR (docs/03); statusGroup itself is not in the table's $select
				return this.waitFor({
					controlType: "sap.m.Table",
					matchers: (oTable) => {
						const oBinding = oTable.getBinding("items");
						const oFirst = oTable.getItems()[0];
						return oTable.getVisible() && !!oTable.getDomRef() && !!oBinding && /\/Requests$/.test(oBinding.getPath()) &&
							!!oFirst && oFirst.getBindingContext().getProperty("priority") === 1 &&
							oFirst.getBindingContext().getProperty("ID").endsWith("000000000003");
					},
					success: () => Opa5.assert.ok(true, "Visible list table shows the error request #3 first"),
					errorMessage: "Visible list table does not start with the error request #3"
				});
			}
		}
	});
});
