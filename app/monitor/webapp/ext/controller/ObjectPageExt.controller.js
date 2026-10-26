sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension",
	"sap/ui/core/Element",
	"sap/base/Log"
], function (ControllerExtension, Element, Log) {
	"use strict";

	/**
	 * Object Page extension (docs/09 §5.1): editing always starts from fresh data, the header offers "Aktualisieren" and
	 * the List Report follows a step (D-14).
	 * Everything else (steps, dialogs, strict handling, messages, draft) is Fiori Elements standard.
	 */
	return ControllerExtension.extend("hydac.custmon.ext.controller.ObjectPageExt", {
		override: {
			editFlow: {
				/** Reload the request before draftEdit so a stale ETag cannot surface on Edit (docs/09 §5.1). */
				onBeforeEdit: function () {
					return this.base.getExtensionAPI().refresh();
				},
				// FE marks the list dirty only outside the FCL and side effects cannot target the entity set: after a step the
				// repaired/completed request must leave its tab and the counts must change → re-run the List Report search (D-14).
				// FE does not await the hook: a failed refresh is logged instead of becoming an unhandled rejection.
				onAfterActionExecution: async function () {
					const oListView = Element.getElementById("hydac.custmon::RequestsList");
					const oApi = oListView && oListView.getController().getExtensionAPI();
					if (!oApi) {
						return;
					}
					try {
						await oApi.refresh();
					} catch (oError) {
						Log.error("List Report refresh after step failed", oError, "hydac.custmon.ext.controller.ObjectPageExt");
					}
				}
			}
		},

		/** Custom header action "Aktualisieren" (manifest content.header.actions.Refresh). */
		onRefresh: function () {
			return this.base.getExtensionAPI().refresh();
		}
	});
});
