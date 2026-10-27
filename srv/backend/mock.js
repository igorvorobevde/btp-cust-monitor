"use strict";

/**
 * Mock-Backend (Phase 1): simuliert S/4 mit der Statusmaschine, dem Customizing aus den CSVs,
 * den Mock-Geschäftspartnern und eigenen Nummernkreisen (03 §7). Schnittstelle: ./index.js.
 */
const cds = require("@sap/cds");
const sm = require("../lib/status-machine");

const NS = "hydac.custmon";

// Nummernkreise für simulierte S/4-Anlagen (03 §7)
function numberRanges() {
	return {
		customer: { prefix: "4", next: 1000001, width: 8 },
		businessPartner: { prefix: "1", next: 1000001, width: 8 },
		contactPerson: { prefix: "0", next: 100000001, width: 10 },
		shipTo: { prefix: "4", next: 2000001, width: 8 }
	};
}

module.exports = function createMockBackend() {
	const db = cds.entities(NS);
	const ranges = numberRanges();
	const newNumber = (kind) => {
		const range = ranges[kind];
		const value = String(range.next++);
		return (range.prefix + value).slice(-range.width).padStart(range.width, "0");
	};

	// Customizing (ProcessSteps, ApprovalRules, Steps je Sprache) ändert sich zur Laufzeit nicht: einmal lesen statt je Request
	// (F-23 Nachtrag). Fehlgeschlagene Lesezugriffe werden nicht gemerkt.
	const cache = new Map();
	const cached = (key, read) => {
		if (!cache.has(key)) {
			cache.set(key, Promise.resolve(read()).catch((e) => { // cds.ql-Queries sind nur thenables
				cache.delete(key);
				throw e;
			}));
		}
		return cache.get(key);
	};

	return {
		kind: "mock",

		/** Customizing für lokal berechnete Flags und Empfehlungen (auch Phase 2: replizierte Kopie, E-14) */
		async loadCustomizing(req) {
			const [processSteps, steps, approvalRules] = await Promise.all([
				cached("ProcessSteps", () => SELECT.from(db.ProcessSteps)),
				cached("Steps:" + (req.locale || ""), () => SELECT.localized.from(db.Steps)),
				cached("ApprovalRules", () => SELECT.from(db.ApprovalRules))
			]);
			return { processSteps, steps, approvalRules };
		},

		/**
		 * Schritt ausführen (S/4: execute_function). Wirft StepError wie die Statusmaschine.
		 * @returns {Promise<object>} Ergebnis von sm.executeStep (requestChanges, adminChanges, shipToChanges, log, messages, failed)
		 */
		async executeStep(request, step, params, { req, roles, user, now }) {
			const [{ processSteps, steps, approvalRules }, partners] = await Promise.all([
				this.loadCustomizing(req),
				SELECT.from(db.MockBusinessPartners)
			]);
			return sm.executeStep(step, request, params, {
				processSteps,
				steps,
				approvalRules,
				findBusinessPartner: (bp) => partners.find((p) => p.businessPartner === bp),
				findBusinessPartnerByCustomer: (customer) => customer && partners.find((p) => p.customer === customer),
				newNumber,
				roles,
				user,
				now
			});
		},

		/** Feldänderungen der Draft-Aktivierung an das führende System (S/4: change_data); im Mock ist die lokale DB führend */
		async saveChanges() {
			return undefined;
		}
	};
};
