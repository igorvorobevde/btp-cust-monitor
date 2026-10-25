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
const TECHNICAL_FIELDS = new Set(["ID", "request_ID", "modifiedAt", "modifiedBy", "createdAt", "createdBy", "isEditable", "editHidden",
	"releaseState", "statusGroup", "statusCriticality", "orderCriticality", "releaseCriticality",
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
const FLAG_INPUT = ["ID", "status_code", "released", "inClarification", "source", "processType"];
/** OData Strict Handling: ohne `Prefer: handling=strict` gilt eine Rückfrage als bestätigt (03 §5.3) */
const isStrict = (req) => /\bhandling=strict\b/i.test(req.headers.prefer || "");

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

		// IDs der Vorgänge, für die ein Entwurf existiert (Schritte und Flags sind dann gesperrt)
		const hasDraft = async (ids) => {
			const drafts = await SELECT.from(Requests.drafts).columns("ID").where({ ID: { in: ids } });
			return new Set(drafts.map((d) => d.ID));
		};

		/**
		 * can*-Flags, isEditable und editHidden am Datensatz setzen – nie null
		 * (Fiori Elements zeigt null als sichtbar, aber deaktiviert). Entwürfe und gesperrte Vorgänge: keine Schritte.
		 */
		const setFlags = (row, state, processSteps, userRoles, { draft = false, locked = false } = {}) => {
			const codes = draft || locked ? [] : sm.availableStepCodes(state, processSteps, userRoles);
			for (const [step, name] of Object.entries(STEP_FLAGS)) {
				row[name] = codes.includes(step);
			}
			row.isEditable = draft ? true : sm.isEditable(state, userRoles.isEditor);
			row.editHidden = !row.isEditable;
		};

		// Flags für aktive Vorgänge und eigene Entwürfe; HasDraftEntity wird erst nach den Handlern gefüllt → eigene Abfrage
		this.after("READ", [Requests, Requests.drafts], async (result, req) => {
			const rows = (Array.isArray(result) ? result : [result]).filter((r) => r && r.ID);
			if (!rows.length) {
				return;
			}
			const draft = !!req.target.isDraft;
			const incomplete = rows.filter((r) => FLAG_INPUT.some((f) => r[f] === undefined));
			const [processSteps, drafted, found] = await Promise.all([
				SELECT.from(db.ProcessSteps),
				draft ? new Set() : hasDraft(rows.map((r) => r.ID)),
				incomplete.length ? SELECT.from(db.Requests).columns(...FLAG_INPUT).where({ ID: { in: incomplete.map((r) => r.ID) } }) : []
			]);
			const lookup = new Map(found.map((f) => [f.ID, f]));
			const userRoles = roles(req);
			for (const row of rows) {
				setFlags(row, lookup.get(row.ID) || row, processSteps, userRoles, { draft, locked: drafted.has(row.ID) });
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
			// ETag Pflicht, kein If-Match: * (03 §3) – zusätzlich zur generischen CAP-Prüfung
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
			setFlags(updated, updated, processSteps, roles(req));
			return { ...updated, IsActiveEntity: true, HasActiveEntity: false, HasDraftEntity: false };
		});

		return super.init();
	}
};
