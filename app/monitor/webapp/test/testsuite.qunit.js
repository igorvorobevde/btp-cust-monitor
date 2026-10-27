// Test Starter configuration (docs/05 §8): one OPA module with all journeys against the CAP mock (profile opa).
// The app runs in English so that titles/labels in the journeys are deterministic.
sap.ui.define(function () {
	"use strict";

	return {
		name: "Test suite – Kundenmonitor",
		defaults: {
			page: "ui5://test-resources/hydac/custmon/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: { version: 2 },
			sinon: false,
			ui5: {
				theme: "sap_horizon",
				language: "en",
				compatVersion: "edge",
				"xx-componentPreload": "off"
			},
			loader: {
				paths: { "hydac/custmon": "../" }
			}
		},
		tests: {
			"integration/opaJourney": { title: "OPA journeys – Kundenmonitor" }
		}
	};
});
