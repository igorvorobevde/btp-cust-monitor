"use strict";

/**
 * CustomerMonitorService – Mock-Implementierung (Phase 1).
 * Vertrag: docs/03_service_vertrag.md. Statuslogik: ./lib/status-machine.js
 */
const cds = require("@sap/cds");
const sm = require("./lib/status-machine");
const { StepError, ErrorCodes } = require("./lib/errors");

const LOG = cds.log("monitor");
const NS = "hydac.custmon";

// Felder, die per PATCH nicht geändert werden dürfen bzw. nicht protokolliert werden
const TECHNICAL_FIELDS = new Set(["ID", "request_ID", "modifiedAt", "modifiedBy", "createdAt", "createdBy", "isEditable"]);

// Nummernkreise für simulierte S/4-Anlagen (03 §7)
const numberRanges = {
	customer: { prefix: "4", next: 1000001, width: 8 },
	businessPartner: { prefix: "1", next: 1000001, width: 8 },
	contactPerson: { prefix: "0", next: 100000001, width: 10 },
	shipTo: { prefix: "4", next: 2000001, width: 8 }
};

function newNumber(kind) {
	const range = numberRanges[kind];
	const value = String(range.next++);
	return (range.prefix + value).slice(-range.width).padStart(range.width, "0");
}

function delay() {
	const ms = Number(process.env.MOCK_LATENCY_MS) || 0;
	return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** If-Match-Header → Zeitstempel in ms (CAP-ETag: W/"<ISO-Timestamp>") */
function parseETag(header) {
	if (!header) {
		return null;
	}
	const raw = String(header).replace(/^W\//, "").replace(/"/g, "").trim();
	if (raw === "*") {
		return "*";
	}
	const time = Date.parse(raw);
	return Number.isNaN(time) ? raw : time;
}

function sameETag(header, modifiedAt) {
	const parsed = parseETag(header);
	if (parsed === null || parsed === "*") {
		return false; // ETag ist Pflicht, kein If-Match: * (05 §5)
	}
	return parsed === Date.parse(modifiedAt);
}

function lastKey(req) {
	const last = req.params[req.params.length - 1];
	return typeof last === "object" ? last.ID : last;
}

module.exports = class CustomerMonitorService extends cds.ApplicationService {
	async init() {
		const { Requests, SalesData, ContactPersons, ShipToParties } = this.entities;
		const db = cds.entities(NS);
		const editableChildren = [SalesData, ContactPersons, ShipToParties];

		// Ohne Accept-Language ist req.locale undefined – dann ersetzt cds.i18n keine Platzhalter
		const t = (req, key, args) => cds.i18n.messages.at(key, req.locale || "", args) || key;

		const roles = (req) => ({
			isEditor: req.user.is("MonitorEditor"),
			isReleaser: req.user.is("MonitorReleaser")
		});

		/**
		 * Datensichtbarkeit (02 §5, R-08): VKORG aus Benutzerattribut SalesOrg;
		 * nicht freigegebene Vorgänge nur mit Rolle MonitorReleaser.
		 * Privilegierte Benutzer (Tests) sehen alles.
		 */
		const visibilityWhere = (req) => {
			const user = req.user;
			if (user._is_privileged) {
				return null;
			}
			const where = [];
			const orgs = [].concat((user.attr && user.attr.SalesOrg) || []);
			where.push({ salesOrganization: { in: orgs.length ? orgs : ["-"] } });
			if (!user.is("MonitorReleaser")) {
				where.push({ released: true });
			}
			return where;
		};

		const loadRequest = async (req, ID) => {
			const query = SELECT.one.from(db.Requests, (r) => {
				r`.*`;
				r.admin((a) => a`.*`);
				r.shipTo((s) => s`.*`);
			}).where({ ID });
			for (const w of visibilityWhere(req) || []) {
				query.where(w);
			}
			const request = await query;
			if (!request) {
				req.reject(404);
			}
			return request;
		};

		const nextLogLine = async (requestId) => {
			const row = await SELECT.one.from(db.LogEntries).columns("max(line) as maxLine").where({ request_ID: requestId });
			return ((row && row.maxLine) || 0) + 1;
		};

		// Requests eines $batch-Changesets laufen parallel → Zeilennummern je Vorgang serialisiert vergeben
		const logQueues = new Map();
		const writeLog = (req, requestId, entries) => {
			if (!entries.length) {
				return Promise.resolve();
			}
			const previous = logQueues.get(requestId) || Promise.resolve();
			const current = previous.then(() => insertLog(req, requestId, entries));
			const settled = current.catch(() => undefined);
			logQueues.set(requestId, settled);
			settled.then(() => logQueues.get(requestId) === settled && logQueues.delete(requestId));
			return current;
		};

		const insertLog = async (req, requestId, entries) => {
			let line = await nextLogLine(requestId);
			const now = new Date().toISOString();
			await INSERT.into(db.LogEntries).entries(entries.map((e) => ({
				request_ID: requestId,
				line: line++,
				messageClass: "ZEC_CUSTOMER",
				createdBy: req.user.id,
				createdAt: now,
				...e
			})));
		};

		// ---------- Fehler-Mapping ----------
		// CAP lehnt fehlendes If-Match generisch mit 428 ab; Vertrag (03 §3): fehlendes/veraltetes ETag → 412
		this.on("error", (err, req) => {
			if (Number(err.status || err.statusCode || err.code) === 428) {
				err.status = 412;
				err.statusCode = 412;
				err.code = "412";
				err.message = t(req, "ETAG_REQUIRED");
			}
		});

		// ---------- Kein CREATE/DELETE (03 §3) ----------
		this.before(["CREATE", "DELETE"], [Requests, ...editableChildren], (req) => {
			req.reject(405, t(req, "METHOD_NOT_ALLOWED"));
		});

		// ---------- Lesen ----------
		this.before("READ", Requests, (req) => {
			for (const w of visibilityWhere(req) || []) {
				req.query.where(w);
			}
		});

		this.after("READ", Requests, async (result, req) => {
			const rows = (Array.isArray(result) ? result : [result]).filter((r) => r && r.ID);
			if (!rows.length) {
				return;
			}
			const incomplete = rows.filter((r) => r.status_code === undefined || r.released === undefined);
			const lookup = new Map();
			if (incomplete.length) {
				const found = await SELECT.from(db.Requests).columns("ID", "status_code", "released")
					.where({ ID: { in: incomplete.map((r) => r.ID) } });
				found.forEach((f) => lookup.set(f.ID, f));
			}
			const { isEditor } = roles(req);
			for (const row of rows) {
				const state = lookup.get(row.ID) || row;
				row.isEditable = sm.isEditable(state, isEditor);
			}
		});

		// ---------- Bearbeiten (03 §6) ----------
		this.before("UPDATE", [Requests, ...editableChildren], async (req) => {
			if (!req.headers["if-match"] || parseETag(req.headers["if-match"]) === "*") {
				req.reject(412, t(req, "ETAG_REQUIRED"));
			}
			const old = await SELECT.one.from(req.subject);
			if (!old) {
				req.reject(404);
			}
			const requestId = req.target === Requests ? old.ID : old.request_ID;
			const request = await loadRequest(req, requestId);
			const notEditable = !sm.isEditable(request, roles(req).isEditor) ||
				(req.target === ContactPersons && request.processType === "CR_WE") ||
				(req.target === ShipToParties && request.processType !== "CR_WE");
			if (notEditable) {
				req.reject({ status: 409, code: ErrorCodes.NOT_EDITABLE, message: t(req, "NOT_EDITABLE") });
			}
			if (!sameETag(req.headers["if-match"], old.modifiedAt)) {
				req.reject(412, t(req, "ETAG_REQUIRED"));
			}

			// Änderungsprotokoll je Feld
			const prefix = { [Requests.name]: "", [SalesData.name]: "salesData.", [ContactPersons.name]: "admin.", [ShipToParties.name]: "shipTo." }[req.target.name];
			const elements = req.target.elements;
			const changes = Object.keys(req.data)
				.filter((f) => !TECHNICAL_FIELDS.has(f) && elements[f] && !elements[f].isAssociation && !elements[f]["@readonly"])
				.filter((f) => (old[f] ?? null) !== (req.data[f] ?? null));
			await writeLog(req, requestId, changes.map((f) => ({
				messageType: "S",
				messageNumber: "040",
				messageText: t(req, "LOG_FIELD_CHANGED", [prefix + f]),
				fieldName: (prefix + f).slice(0, 30),
				oldValue: old[f] == null ? "" : String(old[f]),
				newValue: req.data[f] == null ? "" : String(req.data[f])
			})));

			// Kind-Änderung → ETag des Vorgangs erst vor dem Commit erhöhen (nach allen PATCHes des Changesets),
			// damit parallele Schritte 412 erhalten (03 §3)
			if (req.target !== Requests) {
				req.before("commit", () => UPDATE(db.Requests, requestId).with({
					modifiedAt: new Date().toISOString(),
					modifiedBy: req.user.id
				}));
			}
		});

		// ---------- availableSteps (03 §4) ----------
		this.on("availableSteps", Requests, async (req) => {
			const request = await loadRequest(req, lastKey(req));
			const [processSteps, steps] = await Promise.all([
				SELECT.from(db.ProcessSteps),
				SELECT.localized.from(db.Steps)
			]);
			return sm.toStepOptions(sm.availableStepCodes(request, processSteps, roles(req)), steps);
		});

		// ---------- executeStep (03 §5) ----------
		this.on("executeStep", Requests, async (req) => {
			await delay();
			const ID = lastKey(req);
			const request = await loadRequest(req, ID);
			if (!sameETag(req.headers["if-match"], request.modifiedAt)) {
				req.reject(412, t(req, "ETAG_REQUIRED"));
			}
			const { step, businessPartner, text, force } = req.data;
			const [processSteps, steps, approvalRules, partners] = await Promise.all([
				SELECT.from(db.ProcessSteps),
				SELECT.localized.from(db.Steps),
				SELECT.from(db.ApprovalRules),
				SELECT.from(db.MockBusinessPartners)
			]);
			const now = new Date().toISOString();
			let result;
			try {
				result = sm.executeStep(step, request, { businessPartner, text, force }, {
					processSteps,
					steps,
					approvalRules,
					findBusinessPartner: (bp) => partners.find((p) => p.businessPartner === bp),
					findBusinessPartnerByCustomer: (customer) => customer && partners.find((p) => p.customer === customer),
					newNumber,
					roles: roles(req),
					user: req.user.id,
					now
				});
			} catch (e) {
				if (!(e instanceof StepError)) {
					throw e;
				}
				const message = t(req, e.messageKey, e.args);
				if (e.logEntry) {
					// R-04: Abbruch protokollieren – eigene Transaktion, da die Anfrage zurückgerollt wird
					req.on("failed", () => cds.tx((tx) => tx.run(SELECT.one.from(db.LogEntries).columns("max(line) as maxLine").where({ request_ID: ID }))
						.then((row) => tx.run(INSERT.into(db.LogEntries).entries({
							request_ID: ID,
							line: ((row && row.maxLine) || 0) + 1,
							messageType: "A",
							messageClass: "ZEC_CUSTOMER",
							messageNumber: "058",
							messageText: message,
							step: e.step,
							createdBy: req.user.id,
							createdAt: now
						})))).catch((err) => LOG.error("Abort log failed", err)));
				}
				return req.reject({ status: e.status, code: e.code, message });
			}

			await UPDATE(db.Requests, ID).with({ ...result.requestChanges, modifiedAt: now, modifiedBy: req.user.id });
			if (request.admin && Object.keys(result.adminChanges).length) {
				await UPDATE(db.ContactPersons, request.admin.ID).with({ ...result.adminChanges, modifiedAt: now });
			}
			if (request.shipTo && Object.keys(result.shipToChanges).length) {
				await UPDATE(db.ShipToParties, request.shipTo.ID).with({ ...result.shipToChanges, modifiedAt: now });
			}
			await writeLog(req, ID, result.messages.map((m) => ({
				messageType: m.type,
				messageNumber: "",
				messageText: t(req, m.key, m.args),
				step
			})));

			// Meldungen als sap-messages; Fehlerstatus (140/150/160) als Warnung, da HTTP 200 (03 §5.1)
			for (const m of result.messages) {
				const message = t(req, m.key, m.args);
				if (m.type === "E" || m.type === "W" || result.failed) {
					req.warn({ message, target: "" });
				} else {
					req.info({ message, target: "" });
				}
			}

			const updated = await SELECT.one.from(db.Requests).where({ ID });
			updated.isEditable = sm.isEditable(updated, roles(req).isEditor);
			return updated;
		});

		return super.init();
	}
};
