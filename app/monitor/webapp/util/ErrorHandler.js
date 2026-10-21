sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/core/Messaging",
	"sap/m/MessageBox"
], function (BaseObject, Messaging, MessageBox) {
	"use strict";

	/**
	 * Zentrale Behandlung technischer Fehler (Netzwerk, 5xx, Service nicht erreichbar) – 04 §4.3.
	 * Fachliche Fehler (4xx) behandeln die Abläufe selbst bzw. erscheinen im MessagePopover.
	 */
	return BaseObject.extend("hydac.custmon.util.ErrorHandler", {
		/**
		 * @param {sap.ui.core.UIComponent} oComponent
		 */
		constructor: function (oComponent) {
			BaseObject.call(this);
			this._oComponent = oComponent;
			this._oSeen = new WeakSet();
			this._bOpen = false;

			this._oMessageBinding = Messaging.getMessageModel().bindList("/");
			this._oMessageBinding.attachChange(this._onMessagesChanged, this);

			oComponent.getModel().getMetaModel().requestObject("/$EntityContainer/")
				.catch(() => this._showError(this._getText("msg.serviceUnavailable")));
		},

		destroy: function () {
			this._oMessageBinding.destroy();
			BaseObject.prototype.destroy.apply(this, arguments);
		},

		/**
		 * @param {sap.ui.core.message.Message} oMessage
		 * @returns {boolean} true für Netzwerkfehler und 5xx
		 */
		isTechnicalError: function (oMessage) {
			if (!oMessage.getTechnical || !oMessage.getTechnical() || oMessage.getType() !== "Error") {
				return false;
			}
			const oDetails = oMessage.getTechnicalDetails();
			if (!oDetails) {
				return false;
			}
			return !oDetails.httpStatus || oDetails.httpStatus >= 500;
		},

		_onMessagesChanged: function () {
			const aNew = Messaging.getMessageModel().getData()
				.filter((oMessage) => !this._oSeen.has(oMessage));
			aNew.forEach((oMessage) => this._oSeen.add(oMessage));
			const oTechnical = aNew.find((oMessage) => this.isTechnicalError(oMessage));
			if (oTechnical) {
				this._showError(this._getText("msg.technicalError"), oTechnical.getMessage());
			}
		},

		_showError: function (sText, sDetails) {
			if (this._bOpen) {
				return;
			}
			this._bOpen = true;
			MessageBox.error(sText, {
				details: sDetails,
				actions: [MessageBox.Action.CLOSE],
				onClose: () => {
					this._bOpen = false;
				}
			});
		},

		_getText: function (sKey) {
			return this._oComponent.getModel("i18n").getResourceBundle().getText(sKey);
		}
	});
});
