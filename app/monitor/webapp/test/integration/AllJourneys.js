sap.ui.define([
	"sap/ui/test/Opa5",
	"./pages/List",
	"./pages/Detail",
	"./ListJourney",
	"./DetailJourney",
	"./StepJourney"
], function (Opa5) {
	"use strict";

	Opa5.extendConfig({
		viewNamespace: "hydac.custmon.view.",
		autoWait: true,
		timeout: 30
	});
});
