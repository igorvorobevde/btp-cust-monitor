/* global QUnit */
sap.ui.define([
	"sap/ui/test/opaQunit"
], function (opaTest) {
	"use strict";

	const REQUEST_1 = "a1b2c3d4-0000-4000-8000-000000000001";

	QUnit.module("Detail (F-05 – F-07)");

	opaTest("Deep link opens the detail directly", function (Given, When, Then) {
		Given.iStartMyUIComponent({
			componentConfig: { name: "hydac.custmon", async: true },
			hash: "requests/" + REQUEST_1
		});
		Then.onTheDetail.iShouldSeeTheTitle("Müller Hydraulik GmbH").and.iShouldSeeSectionsFor(false);
	});

	opaTest("Edit and save writes a log entry per field (F-06)", function (Given, When, Then) {
		When.onTheDetail.iPressEdit().and.iEnterName2("Werk Saarbrücken").and.iEnterAdminFirstName("Johanna").and.iPressSave();
		Then.onTheDetail.iShouldBeInDisplayMode()
			.and.iShouldSeeALogEntryForField("name2", "Werk Saarbrücken")
			.and.iShouldSeeALogEntryForField("admin.firstName", "Johanna");
	});

	opaTest("Parallel change leads to 412 dialog and reload (F-06)", function (Given, When, Then) {
		When.onTheDetail.iPressEdit().and.iEnterName2("Wird verworfen").and.iSimulateAParallelChange(REQUEST_1).and.iPressSave();
		Then.onTheDetail.iShouldSeeAMessageBoxContaining("changed in the meantime");
		When.onTheDetail.iCloseTheMessageBoxWith("OK");
		Then.onTheDetail.iShouldBeInDisplayMode().and.iShouldSeeName2("Werk Saarbrücken");
	});

	opaTest("Execute step REJECT with text (F-07)", function (Given, When, Then) {
		When.onTheDetail.iOpenTheStepMenu().and.iSelectTheStep("Reject Request");
		When.onTheDetail.iEnterTheStepText("Firma nicht verifizierbar").and.iConfirmTheStepDialog();
		Then.onTheDetail.iShouldSeeTheStatus("Rejected");
		Then.iTeardownMyUIComponent();
	});
});
