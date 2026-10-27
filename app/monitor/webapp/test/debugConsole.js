// Dev helper for test/debug.html (docs/05 §9), loaded before the UI5 bootstrap: prints every console.error with its JS stack.
// Plain script (no module) so that it is active before the first UI5 module runs.
(function () {
	"use strict";
	const fnError = console.error.bind(console);
	console.error = function () {
		const aArgs = Array.prototype.slice.call(arguments);
		fnError.apply(null, aArgs);
		fnError("STACK " + String(aArgs[0]).slice(0, 80) + " :: " + new Error().stack.split("\n").slice(2, 9).join(" | "));
	};
})();
