// Journeys run against the CAP mock (profile opa, docs/05 §8) via sap.fe.test.JourneyRunner; loaded by the Test Starter
// (testsuite.qunit.js), which boots the Core and starts QUnit after this module has registered the tests.
// The app is launched in English so that titles/labels in the journeys are deterministic.
sap.ui.define([
	"sap/fe/test/JourneyRunner",
	"hydac/custmon/test/integration/pages/RequestsList",
	"hydac/custmon/test/integration/pages/RequestsObjectPage",
	"hydac/custmon/test/integration/ListJourney",
	"hydac/custmon/test/integration/DetailJourney",
	"hydac/custmon/test/integration/StepJourney",
	"hydac/custmon/test/integration/EditJourney"
], function (JourneyRunner, RequestsList, RequestsObjectPage, ListJourney, DetailJourney, StepJourney, EditJourney) {
	"use strict";
	const oRunner = new JourneyRunner({
		launchUrl: sap.ui.require.toUrl("hydac/custmon") + "/index.html",
		launchParameters: { "sap-ui-language": "en" },
		opaConfig: { timeout: 60, autoWait: true }
	});
	oRunner.run({ pages: { onTheList: RequestsList, onTheDetail: RequestsObjectPage } }, ListJourney.run, DetailJourney.run, StepJourney.run, EditJourney.run);
});
