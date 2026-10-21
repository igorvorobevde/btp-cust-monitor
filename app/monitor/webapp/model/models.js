sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device"
], function (JSONModel, Device) {
	"use strict";

	return {
		/**
		 * @returns {sap.ui.model.json.JSONModel} One-way model with device information
		 */
		createDeviceModel: function () {
			const oModel = new JSONModel(Device);
			oModel.setDefaultBindingMode("OneWay");
			return oModel;
		},

		/**
		 * @returns {sap.ui.model.json.JSONModel} Component-wide view state (FCL layout, shared code texts)
		 */
		createAppViewModel: function () {
			return new JSONModel({
				layout: "OneColumn",
				processTypeTexts: {},
				statuses: {}
			});
		}
	};
});
