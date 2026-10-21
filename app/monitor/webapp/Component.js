sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/core/Messaging",
	"./model/models",
	"./util/ErrorHandler"
], function (UIComponent, Messaging, models, ErrorHandler) {
	"use strict";

	return UIComponent.extend("hydac.custmon.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			this.setModel(models.createDeviceModel(), "device");
			this.setModel(models.createAppViewModel(), "appView");
			this.setModel(Messaging.getMessageModel(), "message");

			this._oErrorHandler = new ErrorHandler(this);
			this._loadCodeList("/ProcessTypes", "/processTypeTexts", (o) => o.text);
			this._loadCodeList("/Statuses", "/statuses", (o) => ({ text: o.text, group: o.group }));

			this.getRouter().initialize();
		},

		destroy: function () {
			this._oErrorHandler.destroy();
			UIComponent.prototype.destroy.apply(this, arguments);
		},

		/**
		 * Customizing-Codelisten (Texte sprachabhängig vom Service) einmalig als Map ins appView-Modell laden.
		 * Liste und Detail lesen Status-/Prozessarttexte daraus, statt `status` zu expandieren: ein expandierter
		 * Status, dessen Schlüssel sich durch einen Schritt ändert, lässt den Refresh der Liste scheitern.
		 * @private
		 */
		_loadCodeList: async function (sEntitySet, sTargetPath, fnValue) {
			const oBinding = this.getModel().bindList(sEntitySet);
			try {
				const aContexts = await oBinding.requestContexts(0, 500);
				const mValues = {};
				aContexts.forEach((oContext) => {
					const oEntry = oContext.getObject();
					mValues[oEntry.code] = fnValue(oEntry);
				});
				this.getModel("appView").setProperty(sTargetPath, mValues);
			} catch {
				// Technische Fehler meldet der ErrorHandler über das Message-Model
			} finally {
				oBinding.destroy();
			}
		}
	});
});
