/* global QUnit */
sap.ui.define([
	"sap/ui/test/opaQunit"
], function (opaTest) {
	"use strict";

	const REQUEST_5 = "a1b2c3d4-0000-4000-8000-000000000005";

	QUnit.module("Steps with confirmation (F-07)");

	opaTest("CONFIRM_REQUIRED asks and repeats the step with force", function (Given, When, Then) {
		Given.iStartMyUIComponent({
			componentConfig: { name: "hydac.custmon", async: true },
			hash: "requests/" + REQUEST_5
		});
		When.onTheDetail.iOpenTheStepMenu().and.iSelectTheStep("Change Customer Assignment");
		When.onTheDetail.iEnterTheBusinessPartner("1000002").and.iConfirmTheBusinessPartnerDialog();
		Then.onTheDetail.iShouldSeeAMessageBoxContaining("already assigned to Magento company 999");
		When.onTheDetail.iCloseTheMessageBoxWith("OK");
		Then.onTheDetail.iShouldSeeTheStatus("Customer Assignment Changed");
		Then.iTeardownMyUIComponent();
	});
});
