sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	// F-16/F-26: List Report – initial view "My Work" (Statusgruppe OPEN + ERROR) and process-type filter;
	// views render one table per tab: onTable("<view key>") resolves fe::table::<key>::LineItem
	return {
		run: function () {
			QUnit.module("F-16 List Report");

			opaTest("initial view My Work shows the 18 open requests", function (Given, When, Then) {
				Given.iStartMyApp();
				Then.onTheList.iSeeThisPage();
				Then.onTheList.onTable("MyWork").iCheckRows(18);
			});

			opaTest("process type filter narrows to the 3 ship-to requests", function (Given, When, Then) {
				When.onTheList.onFilterBar().iChangeFilterField({ property: "processType" }, "CR_WE").and.iExecuteSearch();
				Then.onTheList.onTable("MyWork").iCheckRows(3);
				Then.iTeardownMyApp();
			});
		}
	};
});
