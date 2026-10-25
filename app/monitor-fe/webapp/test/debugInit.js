// Dev helper for test/debug.html: hooks mdc PropertyHelper.validateProperties to print duplicate property keys,
// logs unhandled promise rejections with their stack, then starts the component like index.html does.
sap.ui.require([
	"sap/ui/mdc/util/PropertyHelper",
	"sap/ui/core/ComponentSupport"
], function (PropertyHelper, ComponentSupport) {
	"use strict";

	window.addEventListener("unhandledrejection", function (oEvent) {
		console.error("REJECTION " + (oEvent.reason && oEvent.reason.stack ? oEvent.reason.stack.split("\n").slice(0, 8).join(" | ") : oEvent.reason));
	});

	const fnValidate = PropertyHelper.prototype.validateProperties;
	PropertyHelper.prototype.validateProperties = function (aProperties) {
		const aKeys = (aProperties || []).map((oProperty) => oProperty.key !== undefined ? oProperty.key : oProperty.name);
		const aDuplicates = aKeys.filter((sKey, iIndex) => aKeys.indexOf(sKey) !== iIndex);
		if (aDuplicates.length) {
			console.error("DUPKEYS " + JSON.stringify([...new Set(aDuplicates)]) + " ALL " + JSON.stringify(aKeys));
		}
		return fnValidate.apply(this, arguments);
	};

	ComponentSupport.run();
});
