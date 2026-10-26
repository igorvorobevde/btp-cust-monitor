sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension",
	"sap/ui/core/Element"
], function (ControllerExtension, Element) {
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
				onAfterActionExecution: function () {
					const oListView = Element.getElementById("hydac.custmon::RequestsList");
					const oApi = oListView && oListView.getController().getExtensionAPI();
					if (oApi) {
						oApi.refresh();
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
