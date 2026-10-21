sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	const ROUTE_LAYOUTS = {
		list: "OneColumn",
		detail: "TwoColumnsMidExpanded",
		detailFull: "MidColumnFullScreen"
	};

	return BaseController.extend("hydac.custmon.controller.App", {
		onInit: function () {
			this.getRouter().attachRouteMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			const sLayout = ROUTE_LAYOUTS[oEvent.getParameter("name")] || "OneColumn";
			this.getModel("appView").setProperty("/layout", sLayout);
		}
	});
});
