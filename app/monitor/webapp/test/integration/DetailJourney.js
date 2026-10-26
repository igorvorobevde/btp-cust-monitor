sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	const ID = (n) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
	const active = (n) => `Requests(ID=${ID(n)},IsActiveEntity=true)`;

	// F-17/F-26: Object Page read-only – sections per process type, log order, Klärung strip, old bookmarks, next step, release reason
	return {
		run: function () {
			QUnit.module("F-17 Object Page");

			opaTest("deep link opens #20 (CR_WE) with the ship-to section and without the contact section", function (Given, When, Then) {
				Given.iStartMyApp(active(20));
				Then.onTheDetail.iSeeThisPage();
				Then.onTheDetail.onHeader().iCheckTitle("Vogel Antriebe GmbH");
				Then.onTheDetail.onHeader().iCheckDataPoint("Next Step", "Create Ship-To Party");
				Then.onTheDetail.iSeeSectionWithTitle("Ship-To Party");
				Then.onTheDetail.iDoNotSeeSectionWithTitle("Contact Person");
				When.onTheDetail.iGoToSection("Log"); // sections load lazily – scroll the log table into view first
				Then.onTheDetail.iSeeTheLogNewestFirst();
				Then.iTeardownMyApp();
			});

			opaTest("#13 shows the clarification strip, contact section visible", function (Given, When, Then) {
				Given.iStartMyApp(active(13));
				Then.onTheDetail.iSeeThisPage();
				Then.onTheDetail.iSeeTheClarificationStrip("In Klärung");
				Then.onTheDetail.iSeeSectionWithTitle("Contact Person");
				Then.onTheDetail.iDoNotSeeSectionWithTitle("Ship-To Party");
				Then.iTeardownMyApp();
			});

			opaTest("#18 (unreleased) recommends 'Release' and shows the release reason", function (Given, When, Then) {
				Given.iStartMyApp(active(18));
				Then.onTheDetail.iSeeThisPage();
				Then.onTheDetail.onHeader().iCheckDataPoint("Next Step", "Release");
				When.onTheDetail.iGoToSection("Assignment"); // the Freigabe group loads lazily; form container ReleaseGrp inside the AssignmentSection collection facet
				Then.onTheDetail.onForm({ section: "AssignmentSection", fieldGroup: "ReleaseGrp" }).iCheckField({ property: "releaseReason" }, "Manual release required (customizing)");
				Then.iTeardownMyApp();
			});

			opaTest("old bookmark #/requests/<id> is rewritten to the draft key", function (Given, When, Then) {
				Given.iStartMyApp(`/requests/${ID(20)}`);
				Then.onTheDetail.iSeeThisPage();
				Then.onTheDetail.onHeader().iCheckTitle("Vogel Antriebe GmbH");
				Then.iTeardownMyApp();
			});
		}
	};
});
