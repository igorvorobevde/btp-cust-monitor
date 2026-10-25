// Journeys run against the CAP mock (profile opa, docs/05 §8) via sap.fe.test.JourneyRunner.
// The app is launched in English so that titles/labels in the journeys are deterministic.
sap.ui.require([
	"sap/ui/core/Core",
	"sap/fe/test/JourneyRunner",
	"hydac/custmon/test/integration/pages/RequestsList",
	"hydac/custmon/test/integration/pages/RequestsObjectPage",
	"hydac/custmon/test/integration/ListJourney",
	"hydac/custmon/test/integration/DetailJourney",
	"hydac/custmon/test/integration/StepJourney"
], async function (Core, JourneyRunner, RequestsList, RequestsObjectPage, ListJourney, DetailJourney, StepJourney) {
	"use strict";
	await Core.ready();
	const oRunner = new JourneyRunner({
		launchUrl: sap.ui.require.toUrl("hydac/custmon") + "/index.html",
		launchParameters: { "sap-ui-language": "en" },
		opaConfig: { timeout: 60, autoWait: true }
	});
	oRunner.run({ pages: { onTheList: RequestsList, onTheDetail: RequestsObjectPage } }, ListJourney.run, DetailJourney.run, StepJourney.run);
	QUnit.start();
});
