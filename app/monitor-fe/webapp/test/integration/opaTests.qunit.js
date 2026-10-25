// Journeys run against the CAP mock (profile opa, docs/05 §8) via sap.fe.test.JourneyRunner.
sap.ui.require([
	"sap/ui/core/Core",
	"sap/fe/test/JourneyRunner",
	"hydac/custmon/test/integration/pages/RequestsList",
	"hydac/custmon/test/integration/ListJourney"
], async function (Core, JourneyRunner, RequestsList, ListJourney) {
	"use strict";
	await Core.ready();
	const oRunner = new JourneyRunner({
		launchUrl: sap.ui.require.toUrl("hydac/custmon") + "/index.html",
		opaConfig: { timeout: 60, autoWait: true }
	});
	oRunner.run({ pages: { onTheList: RequestsList } }, ListJourney.run);
	QUnit.start();
});
