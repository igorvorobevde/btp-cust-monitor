/* global QUnit */
sap.ui.define([
	"sap/ui/test/opaQunit"
], function (opaTest) {
	"use strict";

	QUnit.module("List (F-04)");

	opaTest("Default filter hides rejected (8xx) and completed (9xx)", function (Given, When, Then) {
		Given.iStartMyUIComponent({ componentConfig: { name: "hydac.custmon", async: true } });
		Then.onTheList.iShouldSeeItemCount(18);
	});

	opaTest("Process type filter", function (Given, When, Then) {
		When.onTheList.iSelectProcessTypes(["CR_WE"]).and.iPressGo();
		Then.onTheList.iShouldSeeItemCount(3).and.iShouldSeeOnlyProcessType("CR_WE");
	});

	opaTest("Filter state survives navigation to detail and back (F-04/F-05)", function (Given, When, Then) {
		When.onTheList.iPressTheRowWithName("Scandi Hydraulics AB");
		Then.onTheDetail.iShouldSeeTheTitle("Scandi Hydraulics AB").and.iShouldSeeSectionsFor(true);
		Then.onTheList.iShouldSeeTheRowSelected("Scandi Hydraulics AB");
		When.onTheDetail.iPressClose();
		Then.onTheList.iShouldSeeItemCount(3);
	});

	opaTest("Reset and 'include rejected'", function (Given, When, Then) {
		When.onTheList.iPressReset();
		Then.onTheList.iShouldSeeItemCount(18);
		When.onTheList.iToggleIncludeRejected().and.iPressGo();
		Then.onTheList.iShouldSeeItemCount(20);
		Then.iTeardownMyUIComponent();
	});
});
