"use strict";

/**
 * Backend-Schnittstelle der Fassade (B-04): alles, was der Service vom führenden System braucht.
 * Phase 1: ./mock.js. Phase 2: S/4-Adapter (get_functions/execute_function/change_data über die Destination,
 * docs/02 §6, docs/09 §7) – wird hier unter seinem kind registriert; der Service bleibt unverändert.
 *
 * Konfiguration: cds.requires.backend.kind = "mock" (Standard).
 *
 * Schnittstelle:
 *   loadCustomizing(req)                                → { processSteps, steps, approvalRules }
 *   executeStep(request, step, params, { req, roles, user, now })
 *                                                       → { requestChanges, adminChanges, shipToChanges, log, messages, failed }
 *                                                         wirft StepError (Rückfrage CONFIRM_REQUIRED, Abbruch, Parameterfehler)
 *   saveChanges(request, changes, { req })              → Feldänderungen der Draft-Aktivierung übernehmen
 */
const cds = require("@sap/cds");

const ADAPTERS = {
	mock: () => require("./mock")()
};

/** Weiteren Adapter registrieren (Phase 2: S/4; Tests: Attrappe) – vor dem Start des Service */
function registerBackend(kind, factory) {
	ADAPTERS[kind] = factory;
}

function createBackend(kind = (cds.env.requires.backend && cds.env.requires.backend.kind) || "mock") {
	const create = ADAPTERS[kind];
	if (!create) {
		throw new Error(`Unknown backend kind '${kind}' (cds.requires.backend.kind); known: ${Object.keys(ADAPTERS).join(", ")}`);
	}
	return create();
}

module.exports = { createBackend, registerBackend };
