sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	const ID = (n) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
	const active = (n) => `Requests(ID=${ID(n)},IsActiveEntity=true)`;

	// F-19: draft editing – edit root + contact fields, save → log entries; data-loss dialog on navigation, discard leaves no draft
	return {
		run: function () {
			QUnit.module("F-19 Draft editing");

			opaTest("#6: edit name 2 and the contact's first name, save → one log entry per field", function (Given, When, Then) {
				Given.iStartMyApp(active(6));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteEdit();
				Then.onTheDetail.iSeeObjectPageInEditMode();
				When.onTheDetail.onForm({ section: "MainSection", fieldGroup: "MainName" }).iChangeField({ property: "name2" }, "Werk Nord");
				When.onTheDetail.iGoToSection("Contact Person"); // sections load lazily – bring the contact form into view first
				When.onTheDetail.onForm({ section: "AdminSection" }).iChangeField({ property: "firstName" }, "Erika");
				When.onTheDetail.onFooter().iExecuteSave();
				Then.onTheDetail.iSeeObjectPageInDisplayMode();
				When.onTheDetail.iGoToSection("Log");
				Then.onTheDetail.onTable({ property: "log" }).iCheckRows({ fieldName: "name2" }, 1);
				Then.onTheDetail.onTable({ property: "log" }).iCheckRows({ fieldName: "admin.firstName" }, 1);
				Then.iTeardownMyApp();
			});

			// FE auto-saves every change into the draft: navigating to another row loses nothing and shows no dialog;
			// the draft (and its lock) stays until the user resumes it and saves or discards.
			opaTest("#6: change, navigate to another row, come back → draft resumes; discard leaves no draft", function (Given, When, Then) {
				Given.iStartMyApp(active(6));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteEdit();
				When.onTheDetail.onForm({ section: "MainSection", fieldGroup: "MainName" }).iChangeField({ property: "name2" }, "Verwerfen");
				When.onTheList.onTable().iPressRow({ magentoCompany: "MC101" }); // #1 – matched on a plain column (Name is a FieldGroup column)
				Then.onTheDetail.onHeader().iCheckTitle("Müller Hydraulik GmbH");
				Then.onTheDetail.iSeeObjectPageInDisplayMode();
				When.onTheList.onTable().iPressRow({ magentoCompany: "MC106" }); // back to #6 → own draft opens in edit mode
				Then.onTheDetail.iSeeObjectPageInEditMode();
				When.onTheDetail.onFooter().iExecuteCancel();
				When.onTheDetail.onFooter().iConfirmCancel(); // "Discard draft?" popover (the draft has changes)
				Then.onTheDetail.iSeeObjectPageInDisplayMode();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step");
				Then.onTheDetail.onHeader().iCheckMenuAction("Create/Change Contact Person", { enabled: true });
				Then.iTeardownMyApp();
			});
		}
	};
});
