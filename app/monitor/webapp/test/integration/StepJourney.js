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
				Then.onTheDetail.onHeader().iCheckDataPoint("Next Step", "Create/Change Contact Person"); // side effect refreshes the recommendation
				Then.iTeardownMyApp();
			});

			opaTest("#1: 'In Clarification' opens the parameter dialog with a mandatory comment; the strip shows it afterwards", function (Given, When, Then) {
				Given.iStartMyApp(active(1));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step").and.iExecuteMenuAction("In Clarification");
				Then.onTheDetail.onActionDialog().iCheckDialogField({ property: "comment" }, undefined, { required: true });
				When.onTheDetail.onActionDialog().iChangeDialogField({ property: "comment" }, "Rückfrage USt-IdNr.").and.iConfirm();
				Then.onTheDetail.iSeeTheClarificationStrip("Rückfrage USt-IdNr.");
				Then.iTeardownMyApp();
			});

			opaTest("#15: a parameter-less step asks with the app's own confirmation text; confirm → completed", function (Given, When, Then) {
				Given.iStartMyApp(active(15));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step").and.iExecuteMenuAction("Complete Manually");
				Then.onTheDetail.iSeeDialogText("Complete the request manually?");
				When.onTheDetail.onConfirmationDialog().iConfirm();
				Then.onTheDetail.onHeader().iCheckDataPoint("Status", "Manually Completed");
				Then.onTheDetail.onHeader().iCheckDataPoint("Next Step", "");
				// D-14: the list follows the step – #15 leaves "My Work"
				Then.onTheList.iCheckView({ key: "MyWork" }, { count: "17" });
				Then.onTheList.onTable("MyWork").iCheckRows({ magentoCompany: "MC115" }, 0);
				Then.iTeardownMyApp();
			});

			opaTest("#5: cancelling the strict-handling question leaves the request unchanged", function (Given, When, Then) {
				Given.iStartMyApp(active(5));
				Then.onTheDetail.iSeeThisPage();
				When.onTheDetail.onHeader().iExecuteAction("Execute Step").and.iExecuteMenuAction("Change Customer Assignment");
				When.onTheDetail.onActionDialog().iChangeDialogField({ property: "businessPartner" }, "1000002").and.iConfirm();
				Then.onTheDetail.iSeeDialogText("4000002");
				When.onTheDetail.onConfirmationDialog().iCancel();
				Then.onTheDetail.onHeader().iCheckDataPoint("Status", "Duplicate – Customer Assigned");
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
