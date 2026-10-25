sap.ui.define(["sap/ui/test/opaQunit"], function (opaTest) {
	"use strict";

	const ID = (n) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
	const active = (n) => `Requests(ID=${ID(n)},IsActiveEntity=true)`;

	// F-18: step actions – menu per can*-flags, parameter dialog, strict-handling question, disabled while editing
	return {
		run: function () {
			QUnit.module("F-18 Steps");

			opaTest("#26: change customer assignment to BP 1000002 → question → confirm → status 110", function (Given, When, Then) {
				Given.iStartMyApp(active(26));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step").and.iExecuteMenuAction("Change Customer Assignment");
				When.onTheDetail.onActionDialog().iChangeDialogField({ property: "businessPartner" }, "1000002").and.iConfirm();
				When.onTheDetail.onConfirmationDialog().iConfirm(); // strict handling: "already assigned to Magento company … ?"
				Then.onTheDetail.onHeader().iCheckDataPoint("Status", "Customer Assignment Changed");
				Then.iTeardownMyApp();
			});

			opaTest("#12 (completed): only 'Process Again' is enabled in the step menu", function (Given, When, Then) {
				Given.iStartMyApp(active(12));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step");
				Then.onTheDetail.onHeader().iCheckMenuAction("Process Again", { enabled: true });
				Then.onTheDetail.onHeader().iCheckMenuAction("Release", { enabled: false });
				Then.iTeardownMyApp();
			});

			opaTest("#6: while a draft exists every step is disabled; discarding the draft re-enables them", function (Given, When, Then) {
				Given.iStartMyApp(active(6));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteEdit();
				Then.onTheDetail.iSeeObjectPageInEditMode();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step");
				Then.onTheDetail.onHeader().iCheckMenuAction("Create/Change Contact Person", { enabled: false });
				Then.onTheDetail.onHeader().iCheckMenuAction("Reject Request", { enabled: false });
				When.onTheDetail.onHeader().iExecuteAction("Execute Step"); // close the menu again
				When.onTheDetail.onFooter().iExecuteCancel();
				Then.onTheDetail.iSeeObjectPageInDisplayMode();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step");
				Then.onTheDetail.onHeader().iCheckMenuAction("Create/Change Contact Person", { enabled: true });
				Then.iTeardownMyApp();
			});
		}
	};
});
