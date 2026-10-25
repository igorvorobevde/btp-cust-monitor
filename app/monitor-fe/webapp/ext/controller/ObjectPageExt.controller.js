sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension"
], function (ControllerExtension) {
	"use strict";

	/**
	 * Object Page extension (docs/09 §5.1): editing always starts from fresh data and the header offers "Aktualisieren".
	 * Everything else (steps, dialogs, strict handling, messages, draft) is Fiori Elements standard.
	 */
	return ControllerExtension.extend("hydac.custmon.ext.controller.ObjectPageExt", {
		override: {
			editFlow: {
				/** Reload the request before draftEdit so a stale ETag cannot surface on Edit (docs/09 §5.1). */
				onBeforeEdit: function () {
					return this.base.getExtensionAPI().refresh();
				}
			}
		},

		/** Custom header action "Aktualisieren" (manifest content.header.actions.Refresh). */
		onRefresh: function () {
			return this.base.getExtensionAPI().refresh();
		}
	});
});
