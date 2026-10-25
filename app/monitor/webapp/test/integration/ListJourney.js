sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	// F-16: List Report – default filter (Statusgruppe OPEN + ERROR) and process-type filter
	return {
		run: function () {
			QUnit.module("F-16 List Report");

			opaTest("default filter shows the 18 open requests", function (Given, When, Then) {
				Given.iStartMyApp();
				Then.onTheList.iSeeThisPage();
				Then.onTheList.onTable().iCheckRows(18);
			});

			opaTest("process type filter narrows to the 3 ship-to requests", function (Given, When, Then) {
				When.onTheList.onFilterBar().iChangeFilterField({ property: "processType" }, "CR_WE").and.iExecuteSearch();
				Then.onTheList.onTable().iCheckRows(3);
				Then.iTeardownMyApp();
			});
		}
	};
});
