sap.ui.define([
	"sap/ui/test/Opa5",
	"sap/ui/test/actions/Press"
], function (Opa5, Press) {
	"use strict";

	const VIEW = "List";

	function rowWithName(sName) {
		return function (oItem) {
			const oContext = oItem.getBindingContext();
			return !!oContext && oContext.getProperty("name") === sName;
		};
	}

	Opa5.createPageObjects({
		onTheList: {
			actions: {
				iSelectProcessTypes: function (aKeys) {
					return this.waitFor({
						id: "filterProcessType",
						viewName: VIEW,
						actions: (oComboBox) => oComboBox.setSelectedKeys(aKeys),
						errorMessage: "Process type filter not found"
					});
				},
				iToggleIncludeRejected: function () {
					return this.waitFor({
						id: "filterIncludeRejected",
						viewName: VIEW,
						actions: new Press(),
						errorMessage: "Checkbox 'include rejected' not found"
					});
				},
				iPressGo: function () {
					return this.waitFor({ id: "filterGo", viewName: VIEW, actions: new Press() });
				},
				iPressReset: function () {
					return this.waitFor({ id: "filterReset", viewName: VIEW, actions: new Press() });
				},
				iPressTheRowWithName: function (sName) {
					return this.waitFor({
						controlType: "sap.m.ColumnListItem",
						viewName: VIEW,
						matchers: rowWithName(sName),
						actions: new Press(),
						errorMessage: "Row '" + sName + "' not found"
					});
				}
			},
			assertions: {
				iShouldSeeItemCount: function (iCount) {
					return this.waitFor({
						id: "requestsTable",
						viewName: VIEW,
						matchers: (oTable) => oTable.getItems().length === iCount &&
							oTable.getBinding("items").getCount() === iCount,
						success: () => Opa5.assert.ok(true, "Table shows " + iCount + " requests"),
						errorMessage: "Table does not show " + iCount + " requests"
					});
				},
				iShouldSeeOnlyProcessType: function (sProcessType) {
					return this.waitFor({
						id: "requestsTable",
						viewName: VIEW,
						matchers: (oTable) => oTable.getItems().length > 0 && oTable.getItems()
							.every((oItem) => oItem.getBindingContext().getProperty("processType") === sProcessType),
						success: () => Opa5.assert.ok(true, "Only " + sProcessType + " requests are shown"),
						errorMessage: "Other process types are shown"
					});
				},
				iShouldSeeTheRowSelected: function (sName) {
					return this.waitFor({
						controlType: "sap.m.ColumnListItem",
						viewName: VIEW,
						matchers: [rowWithName(sName), (oItem) => oItem.getSelected()],
						success: () => Opa5.assert.ok(true, "Row '" + sName + "' is selected"),
						errorMessage: "Row '" + sName + "' is not selected"
					});
				}
			}
		}
	});
});
