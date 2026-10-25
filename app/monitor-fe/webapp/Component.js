sap.ui.define([
	"sap/fe/core/AppComponent"
], function (AppComponent) {
	"use strict";

	/**
	 * Kundenmonitor – Fiori Elements app (OData V4). Everything is annotation-driven (docs/09);
	 * only fragments and a controller extension under ext/ are hand-written.
	 */
	return AppComponent.extend("hydac.custmon.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		}
	});
});
