"use strict";

/**
 * CustomerMonitorService – Mock-Implementierung (Phase 1).
 * Vertrag: docs/03_service_vertrag.md. Statuslogik: ./lib/status-machine.js
 */
const cds = require("@sap/cds");
const sm = require("./lib/status-machine");
const { waitingText } = require("./lib/relative-time");
const { StepError, ErrorCodes } = require("./lib/errors");

const LOG = cds.log("monitor");
const NS = "hydac.custmon";

// Felder, die per PATCH nicht geändert werden dürfen bzw. nicht protokolliert werden
const TECHNICAL_FIELDS = new Set(["ID", "request_ID", "modifiedAt", "modifiedBy", "createdAt", "createdBy", "isEditable", "editHidden",
	"releaseState", "statusGroup", "statusCriticality", "orderCriticality", "releaseCriticality", "waitingSince", "waitingText",
	"nextStep", "nextStepText",
	"IsActiveEntity", "HasActiveEntity", "HasDraftEntity", "DraftAdministrativeData_DraftUUID"]);

// Schrittcode (Customizing) → gebundene Aktion (03 §5); Phase 2: execute_function(step)
const STEP_ACTIONS = Object.freeze({
	RELEASE: "release",
	REJECT: "rejectRequest",
	CLARIFY: "clarify",
	RESET: "reset",
	CREATE: "createCustomer",
	CREATE_WE: "createShipTo",
	AP_MODIFY: "modifyContact",
	CNG_NEW: "convertToNewCustomer",
	MANUAL_OK: "completeManually",
	CHNG_OLD: "assignExistingCustomer",
	CNG_DEBI: "changeCustomerAssignment"
});
const ACTION_STEPS = Object.fromEntries(Object.entries(STEP_ACTIONS).map(([step, action]) => [action, step]));
// Aktionsparameter → Eingabe der Statusmaschine
const PARAMS = Object.freeze({
	rejectRequest: { text: "reason" },
	clarify: { text: "comment" },
	assignExistingCustomer: { businessPartner: "businessPartner" },
	changeCustomerAssignment: { businessPartner: "businessPartner" }
});
// Schrittcode → Verfügbarkeits-Flag (CDS: virtual can* auf Requests); explizit, da rejectRequest → canReject
const STEP_FLAGS = Object.freeze({
	RELEASE: "canRelease",
	REJECT: "canReject",
	CLARIFY: "canClarify",
	RESET: "canReset",
	CREATE: "canCreateCustomer",
	CREATE_WE: "canCreateShipTo",
	AP_MODIFY: "canModifyContact",
	CNG_NEW: "canConvertToNewCustomer",
	MANUAL_OK: "canCompleteManually",
	CHNG_OLD: "canAssignExistingCustomer",
	CNG_DEBI: "canChangeCustomerAssignment"
});
// Felder, die die Flag-Berechnung braucht (werden nachgeladen, wenn nicht im $select)
const FLAG_INPUT = ["ID", "status_code", "released", "inClarification", "source", "processType", "waitingSince"];
/** Dauer wie in cds.fiori.draft_lock_timeout ("15min", "2h", "1d", Sekunden oder Millisekunden) → ms */
function parseDuration(value, fallbackMs) {
	if (typeof value === "number") {
		return value;
	}
	const match = /^\s*(\d+)\s*(ms|s|min|m|h|d)?\s*$/i.exec(String(value || ""));
	if (!match) {
		return fallbackMs;
	}
	const factor = { ms: 1, s: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000 }[(match[2] || "ms").toLowerCase()];
	return Number(match[1]) * factor;
}
const LOCK_TIMEOUT_MS = parseDuration(cds.env.fiori && cds.env.fiori.draft_lock_timeout, 15 * 60 * 1000);

/** OData Strict Handling: ohne `Prefer: handling=strict` gilt eine Rückfrage als bestätigt (03 §5.3) */
const isStrict = (req) => /\bhandling=strict\b/i.test(req.headers.prefer || "");

/** Entfernt read-only/berechnete Elemente (außer Schlüssel und Fremdschlüssel zum Vorgang) aus einem Schreib-Payload. */
function stripReadOnly(data, entity) {
	if (!data || typeof data !== "object") {
		return;
	}
	for (const field of Object.keys(data)) {
		const element = entity.elements[field];
		if (element && !element.key && field !== "request_ID" && (element["@readonly"] || element["@Core.Computed"])) {
			delete data[field];
		}
	}
}

/** Feldvergleich für das Änderungsprotokoll: leer und null gelten als gleich */
const normalize = (value) => (value === "" || value == null ? null : value);

/**
 * Geänderte Felder eines (Kind-)Datensatzes – nur fachliche, nicht read-only Elemente der Entität.
 * @returns {Array<{field: string, fieldName: string, oldValue: string, newValue: string}>}
 */
function diffFields(prefix, oldRow, newRow, entity) {
	if (!oldRow || !newRow) {
		return [];
	}
	const elements = entity.elements;
	// virtuelle/berechnete Elemente (Flags, isEditable) kommen im Draft-Payload mit, sind aber keine Fachänderung
	return Object.keys(newRow)
		.filter((f) => !TECHNICAL_FIELDS.has(f) && elements[f] && !elements[f].isAssociation
			&& !elements[f].virtual && !elements[f]["@readonly"] && !elements[f]["@Core.Computed"])
		.filter((f) => normalize(oldRow[f]) !== normalize(newRow[f]))
		.map((f) => ({
			field: prefix + f,
			fieldName: (prefix + f).slice(0, 30),
			oldValue: oldRow[f] == null ? "" : String(oldRow[f]),
			newValue: newRow[f] == null ? "" : String(newRow[f])
		}));
}

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
		// CAP lehnt fehlendes If-Match generisch mit 428 und veraltetes mit 412 ab; Vertrag (03 §3): beides 412 mit ETAG_REQUIRED.
		// Die Rückfrage-412 (Code CONFIRM_REQUIRED, §5.3) bleibt unberührt.
		this.on("error", (err, req) => {
			const status = Number(err.status || err.statusCode || err.code);
			if (status === 428 || (status === 412 && String(err.code) === "412")) {
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
		// POST /Requests ist mit Draft das Ereignis NEW auf dem Entwurf – Vorgänge kommen nur aus Magento
		this.before("NEW", Requests.drafts, (req) => {
			req.reject(405, t(req, "METHOD_NOT_ALLOWED"));
		});

		// ---------- Lesen ----------
		this.before("READ", Requests, (req) => {
			for (const w of visibilityWhere(req) || []) {
				req.query.where(w);
			}
		});

		// Virtuelle Felder (waitingText, can*-Flags, …) existieren nicht in der DB: $filter/$orderby darauf → 400 statt 500.
		// Menge aus der DB-Entität: die Service-Entität enthält auch CAPs Draft-Elemente (HasDraftEntity, …), die FE filtert
		const VIRTUAL = new Set(Object.values(db.Requests.elements).filter((e) => e.virtual).map((e) => e.name));
		const virtualRef = (node) => {
			if (Array.isArray(node)) {
				return node.map(virtualRef).find(Boolean);
			}
			if (!node || typeof node !== "object") {
				return undefined;
			}
			if (node.ref && node.ref.length === 1 && VIRTUAL.has(node.ref[0])) {
				return node.ref[0];
			}
			return virtualRef(node.xpr) || virtualRef(node.args);
		};
		this.before("READ", [Requests, Requests.drafts], (req) => {
			const { where, orderBy } = req.query.SELECT || {};
			const name = virtualRef(where) || virtualRef(orderBy);
			if (name) {
				req.reject(400, t(req, "VIRTUAL_NOT_QUERYABLE", [name]));
			}
		});

		// IDs der Vorgänge mit gültiger Draft-Sperre: Entwurf vorhanden und letzte Änderung jünger als draft_lock_timeout
		// (wie lean draft bei draftEdit). Abgelaufene Sperren blockieren keine Schritte mehr; eine spätere Aktivierung
		// schreibt nur editierbare Felder und kann ein Schrittergebnis nicht zurückdrehen.
		const hasDraft = async (ids) => {
			const drafts = await SELECT.from(Requests.drafts)
				.columns("ID", { ref: ["DraftAdministrativeData", "LastChangeDateTime"], as: "lastChange" })
				.where({ ID: { in: ids } });
			const threshold = Date.now() - LOCK_TIMEOUT_MS;
			return new Set(drafts.filter((d) => !d.lastChange || Date.parse(d.lastChange) >= threshold).map((d) => d.ID));
		};

		/**
		 * Abgeleitete Werte am Datensatz setzen: can*-Flags, isEditable und editHidden – nie null
		 * (Fiori Elements zeigt null als sichtbar, aber deaktiviert) – sowie waitingText und nextStep/nextStepText
		 * (F-24, Sprache des Requests). Entwürfe und gesperrte Vorgänge: keine Schritte, keine Empfehlung.
		 * ctx = { processSteps, steps, userRoles, req, now (ms) }
		 */
		const setDerived = (row, state, { processSteps, steps, userRoles, req, now }, { draft = false, locked = false } = {}) => {
			const codes = draft || locked ? [] : sm.availableStepCodes(state, processSteps, userRoles);
			for (const [step, name] of Object.entries(STEP_FLAGS)) {
				row[name] = codes.includes(step);
			}
			row.isEditable = draft ? true : sm.isEditable(state, userRoles.isEditor);
			row.editHidden = !row.isEditable;
			row.waitingText = waitingText(state.waitingSince, now, (key, args) => t(req, key, args));
			const step = draft || locked ? null : sm.recommendedStep(state, processSteps, userRoles);
			row.nextStep = step;
			row.nextStepText = step ? ((steps.find((s) => s.code === step) || {}).text || step) : null;
		};

		// Flags für aktive Vorgänge und eigene Entwürfe; HasDraftEntity wird erst nach den Handlern gefüllt → eigene Abfrage
		this.after("READ", [Requests, Requests.drafts], async (result, req) => {
			const rows = (Array.isArray(result) ? result : [result]).filter((r) => r && r.ID);
			if (!rows.length) {
				return;
			}
			const draft = !!req.target.isDraft;
			const incomplete = rows.filter((r) => FLAG_INPUT.some((f) => r[f] === undefined));
			const [processSteps, steps, drafted, found] = await Promise.all([
				SELECT.from(db.ProcessSteps),
				SELECT.localized.from(db.Steps),
				draft ? new Set() : hasDraft(rows.map((r) => r.ID)),
				incomplete.length ? SELECT.from(db.Requests).columns(...FLAG_INPUT).where({ ID: { in: incomplete.map((r) => r.ID) } }) : []
			]);
			const lookup = new Map(found.map((f) => [f.ID, f]));
			const ctx = { processSteps, steps, userRoles: roles(req), req, now: Date.now() };
			for (const row of rows) {
				setDerived(row, lookup.get(row.ID) || row, ctx, { draft, locked: drafted.has(row.ID) });
			}
		});

		// ---------- Bearbeiten per Draft (03 §6, E-12) ----------
		// draftEdit: ETag prüft CAP generisch (428 → 412); hier nur die fachliche Bearbeitbarkeit (E-11)
		this.before("EDIT", Requests, async (req) => {
			const request = await loadRequest(req, lastKey(req));
			if (!sm.isEditable(request, roles(req).isEditor)) {
				req.reject({ status: 409, code: ErrorCodes.NOT_EDITABLE, message: t(req, "NOT_EDITABLE") });
			}
		});

		// UPDATE auf dem aktiven Vorgang = Draft-Aktivierung (deep, inkl. salesData/admin/shipTo; Kind-Handler feuern nicht)
		// oder programmatisch. Änderungsprotokoll je geändertem Feld, Prozessart-Regel für admin/shipTo.
		this.before("UPDATE", Requests, async (req) => {
			const ID = req.data.ID ?? lastKey(req);
			const old = await SELECT.one.from(db.Requests, (r) => {
				r`.*`;
				r.salesData((s) => s`.*`);
				r.admin((a) => a`.*`);
				r.shipTo((s) => s`.*`);
			}).where({ ID });
			if (!old) {
				req.reject(404);
			}
			if (!sm.isEditable(old, roles(req).isEditor)) {
				req.reject({ status: 409, code: ErrorCodes.NOT_EDITABLE, message: t(req, "NOT_EDITABLE") });
			}
			const changes = [
				...diffFields("", old, req.data, Requests),
				...diffFields("salesData.", old.salesData, req.data.salesData, SalesData),
				...diffFields("admin.", old.admin, req.data.admin, ContactPersons),
				...diffFields("shipTo.", old.shipTo, req.data.shipTo, ShipToParties)
			];
			const forbidden = old.processType === "CR_WE" ? "admin." : "shipTo.";
			if (changes.some((c) => c.field.startsWith(forbidden))) {
				req.reject({ status: 409, code: ErrorCodes.NOT_EDITABLE, message: t(req, "NOT_EDITABLE") });
			}
			// Nur editierbare Felder schreiben: read-only/berechnete Werte im Draft-Payload sind die Kopie vom draftEdit
			// und dürfen zwischenzeitliche Änderungen des aktiven Vorgangs (Schritte) nicht zurückdrehen
			stripReadOnly(req.data, Requests);
			stripReadOnly(req.data.salesData, SalesData);
			stripReadOnly(req.data.admin, ContactPersons);
			stripReadOnly(req.data.shipTo, ShipToParties);
			await writeLog(req, ID, changes.map((c) => ({
				messageType: "S",
				messageNumber: "040",
				messageText: t(req, "LOG_FIELD_CHANGED", [c.field]),
				fieldName: c.fieldName,
				oldValue: c.oldValue,
				newValue: c.newValue
			})));
		});

		// ---------- Schrittaktionen (03 §5): eine gebundene Aktion je Schritt, generischer Dispatcher ----------
		this.on(Object.values(STEP_ACTIONS), [Requests, Requests.drafts], async (req) => {
			const step = ACTION_STEPS[req.event];
			if (req.target.isDraft) {
				return req.reject({ status: 400, code: ErrorCodes.STEP_NOT_ALLOWED, message: t(req, "STEP_NOT_ALLOWED", [step]) });
			}
			await delay();
			const ID = lastKey(req);
			const request = await loadRequest(req, ID);
			// ETag Pflicht, kein If-Match: * (03 §3). Dies ist die EINZIGE ETag-Prüfung für Schrittaktionen:
			// CAP registriert seine generische Prüfung bei draft-enabled Entitäten nur für Aktionen auf dem Entwurf.
			if (!sameETag(req.headers["if-match"], request.modifiedAt)) {
				req.reject(412, t(req, "ETAG_REQUIRED"));
			}
			if ((await hasDraft([ID])).size) {
				req.reject({ status: 409, code: "DRAFT_ALREADY_EXISTS", message: t(req, "DRAFT_ALREADY_EXISTS") });
			}
			const params = { force: !isStrict(req) };
			for (const [key, param] of Object.entries(PARAMS[req.event] || {})) {
				params[key] = req.data[param];
			}
			const { businessPartner, text, force } = params;
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
				// Rückfrage per OData Strict Handling (03 §5.3): 412 + Preference-Applied, Frage in details[] (FE zeigt sie im Bestätigungsdialog)
				if (e.code === ErrorCodes.CONFIRM_REQUIRED) {
					(req.res ?? req.http.res).set("Preference-Applied", "handling=strict");
					return req.reject({ status: 412, code: e.code, message, details: [{ code: e.code, message, numericSeverity: 3 }] });
				}
				// Parameterfehler zeigen auf den Dialogparameter
				const [paramName] = Object.values(PARAMS[req.event] || {});
				const target = paramName && [ErrorCodes.BP_NOT_FOUND, ErrorCodes.BP_NOT_CUSTOMER, ErrorCodes.INPUT_REQUIRED, ErrorCodes.INPUT_TOO_LONG].includes(e.code)
					? paramName : undefined;
				return req.reject({ status: e.status, code: e.code, message, target });
			}

			// Bedingtes Schreiben: nur wenn der Vorgang seit dem Lesen unverändert ist (kein Fenster zwischen Prüfung und Schreiben)
			const affected = await UPDATE(db.Requests).where({ ID, modifiedAt: request.modifiedAt })
				.with({ ...result.requestChanges, modifiedAt: now, modifiedBy: req.user.id });
			if (!affected) {
				req.reject(412, t(req, "ETAG_REQUIRED"));
			}
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

			// sap-messages (03 §5.2): Fehlerstatus (140/150/160) → Warnungen (HTTP 200, FE zeigt Dialog);
			// Erfolg → genau eine Erfolgsmeldung (FE zeigt Toast) plus etwaige Warnungen; alle Details stehen im Protokoll
			if (result.failed) {
				for (const m of result.messages) {
					req.warn({ message: t(req, m.key, m.args) });
				}
			} else {
				const stepText = (steps.find((s) => s.code === step) || {}).text || step;
				const newStatus = result.requestChanges.status_code;
				const [statusRow] = newStatus ? await SELECT.localized.from(db.Statuses).where({ code: newStatus }) : [];
				req.notify({ message: newStatus
					? t(req, "ACTION_DONE_STATUS", [stepText, (statusRow && statusRow.text) || newStatus])
					: t(req, "ACTION_DONE", [stepText]) });
				for (const m of result.messages.filter((x) => x.type === "E" || x.type === "W")) {
					req.warn({ message: t(req, m.key, m.args) });
				}
			}

			const updated = await SELECT.one.from(db.Requests).where({ ID });
			setDerived(updated, updated, { processSteps, steps, userRoles: roles(req), req, now: Date.now() }, {});
			return { ...updated, IsActiveEntity: true, HasActiveEntity: false, HasDraftEntity: false };
		});

		return super.init();
	}
};
