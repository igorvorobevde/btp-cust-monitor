sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	// F-16/F-26: List Report worklist – views (IconTabBar, one table per tab: onTable("<view key>")),
	// counts per view, priority sort (errors first), next-step/waiting/release-reason columns, filter bar + view
	return {
		run: function () {
			QUnit.module("F-26 Worklist");

			opaTest("'My Work' is the initial view: 18 rows, errors first, new columns, all counts visible", function (Given, When, Then) {
				Given.iStartMyApp();
				Then.onTheList.iSeeThisPage();
				Then.onTheList.iCheckView({ key: "MyWork" }, { count: "18" });
				Then.onTheList.iCheckView({ key: "Error" }, { count: "4" });
				Then.onTheList.iCheckView({ key: "Clarification" }, { count: "2" });
				Then.onTheList.iCheckView({ key: "Release" }, { count: "4" });
				Then.onTheList.iCheckView({ key: "All" }, { count: "26" });
				Then.onTheList.onTable("MyWork").iCheckRows(18);
				Then.onTheList.iSeeErrorsFirst();
				Then.onTheList.onTable("MyWork").iCheckColumns(13, { "Next Step": { visible: true }, "Waiting Since": { visible: true }, "Release Reason": { visible: true } });
				Then.onTheList.onTable("MyWork").iCheckRows({ nextStepText: "Create Customer and Admin" }, 4);
				Then.onTheList.onTable("MyWork").iCheckRows({ nextStepText: "Release" }, 4);
			});

			opaTest("view 'Errors' shows the 4 error requests; 'Release' 4 with their reason; 'In Clarification' 2", function (Given, When, Then) {
				When.onTheList.iGoToView({ key: "Error" });
				Then.onTheList.onTable("Error").iCheckRows(4);
				Then.onTheList.onTable("Error").iCheckRows({ status_code: "Error Creating New Customer" }, 1);
				When.onTheList.iGoToView({ key: "Release" });
				Then.onTheList.onTable("Release").iCheckRows(4);
				Then.onTheList.onTable("Release").iCheckRows({ releaseReason: "Manual release required (customizing)" }, 4);
				When.onTheList.iGoToView({ key: "Clarification" });
				Then.onTheList.onTable("Clarification").iCheckRows(2);
			});

			opaTest("the filter bar combines with the view: 'My Work' + process type CR_WE → 3 and the counts follow", function (Given, When, Then) {
				When.onTheList.iGoToView({ key: "MyWork" });
				When.onTheList.onFilterBar().iChangeFilterField({ property: "processType" }, "CR_WE").and.iExecuteSearch();
				Then.onTheList.onTable("MyWork").iCheckRows(3);
				Then.onTheList.iCheckView({ key: "Error" }, { count: "1" }); // #9 is the only CR_WE error
				Then.iTeardownMyApp();
			});
		}
	};
});
