sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	"../model/formatter"
], function (Controller, UIComponent, MessageBox, formatter) {
	"use strict";

	return Controller.extend("hydac.custmon.controller.BaseController", {
		formatter: formatter,

		/** @returns {sap.f.routing.Router} */
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		getModel: function (sName) {
			return this.getView().getModel(sName) || this.getOwnerComponent().getModel(sName);
		},

		setModel: function (oModel, sName) {
			this.getView().setModel(oModel, sName);
			return this;
		},

		/** @returns {sap.base.i18n.ResourceBundle} */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		getText: function (sKey, aArgs) {
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		formatStatusIcon: function (sCode, mStatuses) {
			return formatter.statusIcon(formatter.statusGroup(sCode, mStatuses));
		},

		formatStatusState: function (sCode, mStatuses) {
			return formatter.statusState(formatter.statusGroup(sCode, mStatuses));
		},

		navTo: function (sRoute, oParams, bReplace) {
			this.getRouter().navTo(sRoute, oParams || {}, bReplace);
		},

		/**
		 * Asks before leaving unsaved changes (04 §1). Resolves true if navigation may continue;
		 * in that case pending changes are discarded.
		 * @returns {Promise<boolean>}
		 */
		confirmDiscardChanges: function () {
			const oModel = this.getModel();
			if (!oModel.hasPendingChanges("changes")) {
				return Promise.resolve(true);
			}
			return new Promise((resolve) => {
				MessageBox.confirm(this.getText("msg.discardChanges"), {
					title: this.getText("msg.discardChanges.title"),
					emphasizedAction: MessageBox.Action.CANCEL,
					onClose: (sAction) => {
						if (sAction === MessageBox.Action.OK) {
							oModel.resetChanges("changes");
							resolve(true);
						} else {
							resolve(false);
						}
					}
				});
			});
		}
	});
});
