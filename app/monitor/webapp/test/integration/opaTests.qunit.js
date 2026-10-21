/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["sap/ui/core/Core"], async function (Core) {
	"use strict";
	await Core.ready();
	sap.ui.require(["hydac/custmon/test/integration/AllJourneys"], function () {
		QUnit.start();
	});
});
