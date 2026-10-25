sap.ui.define([
	"sap/fe/test/ObjectPage",
	"sap/ui/test/Opa5"
], function (ObjectPage, Opa5) {
	"use strict";

	// Object Page page object + app-specific assertions (sections hidden per process type, log order, Klärung strip)
	return new ObjectPage({
		appId: "hydac.custmon",
		componentId: "RequestsObjectPage",
		entitySet: "Requests"
	}, {
		actions: {},
		assertions: {
			iDoNotSeeSectionWithTitle: function (sTitle) {
				return this.waitFor({
					controlType: "sap.uxap.ObjectPageLayout",
					matchers: (oLayout) => oLayout.getSections().filter((oSection) => oSection.getVisible())
						.every((oSection) => oSection.getTitle() !== sTitle),
					success: () => Opa5.assert.ok(true, "Section '" + sTitle + "' is hidden"),
					errorMessage: "Section '" + sTitle + "' is visible"
				});
			},
			iSeeTheLogNewestFirst: function () {
				return this.waitFor({
					controlType: "sap.m.Table",
					matchers: (oTable) => {
						const oBinding = oTable.getBinding("items");
						const aItems = oTable.getItems();
						const line = (i) => aItems[i].getBindingContext().getProperty("line");
						return !!oBinding && /(^|\/)log$/.test(oBinding.getPath()) && aItems.length >= 1 &&
							(aItems.length < 2 || line(0) > line(1));
					},
					success: () => Opa5.assert.ok(true, "Log table shows the newest entry first"),
					errorMessage: "Log table missing, empty or not sorted by line desc"
				});
			},
			iSeeDialogText: function (sText) {
				return this.waitFor({
					controlType: "sap.m.Dialog",
					searchOpenDialogs: true, // MessageBox dialogs live outside the page's view
					matchers: (oDialog) => oDialog.isOpen() && !!oDialog.getDomRef() && oDialog.getDomRef().textContent.includes(sText),
					success: () => Opa5.assert.ok(true, "Open dialog shows '" + sText + "'"),
					errorMessage: "No open dialog shows '" + sText + "'"
				});
			},
			iSeeTheClarificationStrip: function (sComment) {
				return this.waitFor({
					controlType: "sap.m.MessageStrip",
					matchers: (oStrip) => oStrip.getType() === "Warning" && oStrip.getText().includes(sComment),
					success: () => Opa5.assert.ok(true, "Clarification strip shows '" + sComment + "'"),
					errorMessage: "Clarification strip with '" + sComment + "' not found"
				});
			}
		}
	});
});
