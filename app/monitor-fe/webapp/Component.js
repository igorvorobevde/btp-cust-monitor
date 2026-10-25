sap.ui.define([
	"sap/fe/core/AppComponent"
], function (AppComponent) {
	"use strict";

	// Old freestyle bookmarks (#/requests/<uuid>[/full]) → Fiori Elements route with draft keys (docs/04 §1)
	const LEGACY_HASH = /^#\/?requests\/([0-9a-f-]{36})(\/full)?$/i;

	/**
	 * Kundenmonitor – Fiori Elements app (OData V4). Everything is annotation-driven (docs/09);
	 * only fragments and a controller extension under ext/ are hand-written.
	 */
	return AppComponent.extend("hydac.custmon.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			const aMatch = LEGACY_HASH.exec(window.location.hash);
			if (aMatch) {
				window.location.replace("#/Requests(ID=" + aMatch[1].toLowerCase() + ",IsActiveEntity=true)");
			}
			AppComponent.prototype.init.apply(this, arguments);
		}
	});
});
