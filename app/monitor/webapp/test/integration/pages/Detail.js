sap.ui.define([
	"sap/ui/test/Opa5",
	"sap/ui/test/actions/Press",
	"sap/ui/test/actions/EnterText",
	"sap/ui/test/matchers/PropertyStrictEquals",
	"sap/ui/model/odata/v4/ODataModel"
], function (Opa5, Press, EnterText, PropertyStrictEquals, ODataModel) {
	"use strict";

	const VIEW = "Detail";

	Opa5.createPageObjects({
		onTheDetail: {
			actions: {
				iPressEdit: function () {
					return this.waitFor({ id: "editButton", viewName: VIEW, actions: new Press() });
				},
				iEnterName2: function (sText) {
					return this.waitFor({
						id: "mainName2",
						viewName: VIEW,
						matchers: new PropertyStrictEquals({ name: "editable", value: true }),
						actions: new EnterText({ text: sText })
					});
				},
				iEnterAdminFirstName: function (sText) {
					return this.waitFor({
						id: "adminFirstName",
						viewName: VIEW,
						matchers: new PropertyStrictEquals({ name: "editable", value: true }),
						actions: new EnterText({ text: sText })
					});
				},
				/** Zweiter Benutzer/Tab: ändert den Vorgang über ein eigenes Model (nur Testcode) */
				iSimulateAParallelChange: function (sId) {
					const oModel = new ODataModel({ serviceUrl: "/odata/v4/monitor/" });
					const oContext = oModel.bindContext("/Requests(" + sId + ")").getBoundContext();
					return this.iWaitForPromise(oContext.requestObject("name4")
						.then(() => oContext.setProperty("name4", "Paralleländerung", "$direct"))
						.finally(() => oModel.destroy()));
				},
				iCloseTheMessageBoxWith: function (sButtonText) {
					return this.waitFor({
						searchOpenDialogs: true,
						controlType: "sap.m.Button",
						matchers: new PropertyStrictEquals({ name: "text", value: sButtonText }),
						actions: new Press()
					});
				},
				iEnterTheBusinessPartner: function (sBp) {
					return this.waitFor({
						id: "stepBpInput",
						viewName: VIEW,
						searchOpenDialogs: true,
						actions: new EnterText({ text: sBp, keepFocus: true })
					});
				},
				iConfirmTheBusinessPartnerDialog: function () {
					return this.waitFor({
						id: "stepBpOk",
						viewName: VIEW,
						searchOpenDialogs: true,
						matchers: new PropertyStrictEquals({ name: "enabled", value: true }),
						actions: new Press()
					});
				},
				iPressSave: function () {
					return this.waitFor({ id: "saveButton", viewName: VIEW, actions: new Press() });
				},
				iPressClose: function () {
					return this.waitFor({ id: "closeButton", viewName: VIEW, actions: new Press() });
				},
				iOpenTheStepMenu: function () {
					return this.waitFor({ id: "stepButton", viewName: VIEW, actions: new Press() });
				},
				iSelectTheStep: function (sText) {
					return this.waitFor({
						searchOpenDialogs: true,
						// sap.m.Menu rendert je nach UI5-Version eigene oder sap.ui.unified-Items
						matchers: (oControl) => /MenuItem$/.test(oControl.getMetadata().getName()) &&
							oControl.getText() === sText && !!oControl.getDomRef(),
						actions: new Press(),
						errorMessage: "Step '" + sText + "' not found in menu"
					});
				},
				iEnterTheStepText: function (sText) {
					return this.waitFor({
						id: "stepTextArea",
						viewName: VIEW,
						searchOpenDialogs: true,
						actions: new EnterText({ text: sText })
					});
				},
				iConfirmTheStepDialog: function () {
					return this.waitFor({
						id: "stepTextOk",
						viewName: VIEW,
						searchOpenDialogs: true,
						matchers: new PropertyStrictEquals({ name: "enabled", value: true }),
						actions: new Press()
					});
				}
			},
			assertions: {
				iShouldSeeTheTitle: function (sName) {
					return this.waitFor({
						controlType: "sap.m.Title",
						viewName: VIEW,
						matchers: new PropertyStrictEquals({ name: "text", value: sName }),
						success: () => Opa5.assert.ok(true, "Detail shows '" + sName + "'"),
						errorMessage: "Detail title '" + sName + "' not shown"
					});
				},
				iShouldSeeSectionsFor: function (bShipTo) {
					return this.waitFor({
						id: ["sectionAdmin", "sectionShipTo"],
						viewName: VIEW,
						visible: false,
						matchers: (oSection) => !!oSection.getBindingContext(),
						check: (aSections) => aSections[0].getVisible() === !bShipTo && aSections[1].getVisible() === bShipTo,
						success: () => Opa5.assert.ok(true, bShipTo
							? "Warenempfänger visible, admin hidden"
							: "Admin visible, Warenempfänger hidden"),
						errorMessage: "Section visibility does not match process type"
					});
				},
				iShouldSeeALogEntryForField: function (sField, sNewValue) {
					return this.waitFor({
						id: "logTable",
						viewName: VIEW,
						matchers: (oTable) => oTable.getItems().some((oItem) => {
							const oContext = oItem.getBindingContext();
							return oContext.getProperty("fieldName") === sField && oContext.getProperty("newValue") === sNewValue;
						}),
						success: () => Opa5.assert.ok(true, "Log contains change of " + sField),
						errorMessage: "No log entry for " + sField
					});
				},
				iShouldSeeAMessageBoxContaining: function (sText) {
					return this.waitFor({
						searchOpenDialogs: true,
						controlType: "sap.m.Text",
						matchers: (oText) => oText.getText().includes(sText),
						success: () => Opa5.assert.ok(true, "Message box shows '" + sText + "'"),
						errorMessage: "No message box with '" + sText + "'"
					});
				},
				iShouldSeeName2: function (sValue) {
					return this.waitFor({
						id: "mainName2",
						viewName: VIEW,
						matchers: new PropertyStrictEquals({ name: "value", value: sValue }),
						success: () => Opa5.assert.ok(true, "Name 2 is '" + sValue + "'"),
						errorMessage: "Name 2 is not '" + sValue + "'"
					});
				},
				iShouldBeInDisplayMode: function () {
					return this.waitFor({
						id: "editButton",
						viewName: VIEW,
						success: () => Opa5.assert.ok(true, "Display mode with edit button")
					});
				},
				iShouldSeeTheStatus: function (sStatusText) {
					return this.waitFor({
						id: "headerStatus",
						viewName: VIEW,
						matchers: new PropertyStrictEquals({ name: "text", value: sStatusText }),
						success: () => Opa5.assert.ok(true, "Status is '" + sStatusText + "'"),
						errorMessage: "Status '" + sStatusText + "' not shown"
					});
				}
			}
		}
	});
});
