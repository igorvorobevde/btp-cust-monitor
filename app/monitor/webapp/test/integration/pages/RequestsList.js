sap.ui.define(["sap/fe/test/ListReport"], function (ListReport) {
	"use strict";

	// List Report page object (FE component id from manifest routing targets)
	return new ListReport({
		appId: "hydac.custmon",
		componentId: "RequestsList",
		entitySet: "Requests"
	});
});
