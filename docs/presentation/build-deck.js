/* eslint-disable */
/**
 * Builds docs/presentation/Customer_Monitor_Design_Review.pptx from docs/11_design_review_hydac.md (content copied, not parsed).
 *
 * Build (pptxgenjs, react-icons, react-dom, sharp are NOT project dependencies – install them in a scratch folder):
 *   mkdir -p /tmp/deck-tools && cd /tmp/deck-tools && npm init -y && npm i pptxgenjs react-icons react react-dom sharp
 *   NODE_PATH=/tmp/deck-tools/node_modules PPTX_SKILL=<path to the pptx skill> node docs/presentation/build-deck.js
 *
 * PPTX_SKILL is optional: when set, scripts/apply_theme.js from the skill writes the theme colours into the file.
 */
"use strict";
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Fi = require("react-icons/fi");
const sharp = require("sharp");

const OUT = path.join(__dirname, "Customer_Monitor_Design_Review.pptx");

// ---------------------------------------------------------------------------------------------- theme
const THEME = {
	name: "Kundenmonitor BTP",
	headFontFace: "Cambria",
	bodyFontFace: "Calibri",
	colors: {
		dk1: "1F2933", // text
		lt1: "FFFFFF", // background
		dk2: "14213D", // navy – title slides, headings
		lt2: "EEF2F7", // light panel
		accent1: "14213D", // navy
		accent2: "0E7C7B", // teal – built / positive
		accent3: "E0A526", // amber – designed, not built
		accent4: "C8473F", // red – open question / risk
		accent5: "5B6B7A", // slate – muted text
		accent6: "C9D6E8", // ice – borders, light accents
		hlink: "0E7C7B",
		folHlink: "5B6B7A"
	}
};
const HX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "purplecat";
pres.title = "Customer Monitor on SAP BTP – Design review";
pres.subject = "Design review with HYDAC IT";
const C = pres.SchemeColor;

const W = 13.333;
const LM = 0.6; // left margin
const CW = 12.13; // content width
const TOP = 1.35; // content top
const FOOTER = "Customer Monitor on SAP BTP · Design review · purplecat for HYDAC · November 2026";

// ---------------------------------------------------------------------------------------------- layouts
pres.defineSlideMaster({
	title: "TITLE",
	background: { color: HX.dk2 },
	objects: [
		{ placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.2, w: 11.7, h: 1.4, fontSize: 44, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
		{ placeholder: { options: { name: "subtitle", type: "body", x: 0.8, y: 3.7, w: 11.7, h: 0.8, fontSize: 22, color: C.accent6, valign: "top", margin: 0 }, text: "" } },
		{ placeholder: { options: { name: "meta", type: "body", x: 0.8, y: 5.6, w: 11.7, h: 1.2, fontSize: 14, color: C.accent6, valign: "top", margin: 0 }, text: "" } }
	]
});
pres.defineSlideMaster({
	title: "SECTION",
	background: { color: HX.dk2 },
	objects: [
		{ placeholder: { options: { name: "num", type: "body", x: 0.8, y: 2.0, w: 3, h: 1.3, fontSize: 66, bold: true, color: C.accent2, valign: "bottom", margin: 0 }, text: "" } },
		{ placeholder: { options: { name: "title", type: "title", x: 0.8, y: 3.4, w: 11.7, h: 1.2, fontSize: 38, bold: true, color: C.background1, valign: "top", margin: 0 }, text: "" } },
		{ placeholder: { options: { name: "sub", type: "body", x: 0.8, y: 4.7, w: 11.7, h: 1.0, fontSize: 16, color: C.accent6, valign: "top", margin: 0 }, text: "" } }
	]
});
pres.defineSlideMaster({
	title: "CONTENT",
	background: { color: HX.lt1 },
	objects: [
		{ placeholder: { options: { name: "title", type: "title", x: LM, y: 0.38, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: C.accent1, valign: "middle", margin: 0 }, text: "" } },
		{ text: { text: FOOTER, options: { x: LM, y: 7.02, w: 9, h: 0.3, fontSize: 9, color: C.accent5, margin: 0, isTextBox: true } } }
	],
	slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.3, fontSize: 9, color: C.accent5, align: "right" }
});
pres.defineSlideMaster({
	title: "CLOSING",
	background: { color: HX.dk2 },
	objects: [
		{ placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.4, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
		{ placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.8, w: 11.7, h: 2.6, fontSize: 16, color: C.accent6, valign: "top", margin: 0 }, text: "" } }
	]
});

// ---------------------------------------------------------------------------------------------- helpers
const iconCache = new Map();
async function iconData(name, hex) {
	const key = name + hex;
	if (iconCache.has(key)) return iconCache.get(key);
	const Comp = Fi[name];
	if (!Comp) throw new Error("unknown icon " + name);
	let svg = renderToStaticMarkup(React.createElement(Comp, { size: 256, strokeWidth: 2 }));
	svg = svg.replace(/currentColor/g, "#" + hex);
	const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
	const data = "image/png;base64," + buf.toString("base64");
	iconCache.set(key, data);
	return data;
}
/** teal circle with a white icon – the deck's motif */
async function iconCircle(slide, name, x, y, d = 0.5, hex = HX.accent2) {
	slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: hex }, line: { color: hex, width: 0 } });
	slide.addImage({ data: await iconData(name, "FFFFFF"), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56 });
}
function numCircle(slide, n, x, y, d = 0.42, hex = HX.accent1) {
	slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: hex }, line: { color: hex, width: 0 } });
	slide.addText(String(n), { x, y, w: d, h: d, fontSize: d >= 0.42 ? 13 : 11, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
}
function dot(slide, x, y, hex, d = 0.16) {
	slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: hex }, line: { color: hex, width: 0 } });
}
function card(slide, x, y, w, h, opts = {}) {
	slide.addShape(pres.ShapeType.roundRect, {
		x, y, w, h, rectRadius: 0.08,
		fill: { color: opts.fill || C.background2 },
		line: { color: opts.line || HX.accent6, width: opts.lineW == null ? 0.75 : opts.lineW }
	});
}
function text(slide, t, x, y, w, h, opts = {}) {
	slide.addText(t, Object.assign({ x, y, w, h, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 3 }, opts));
}
/** array of {t, b?} → runs with line breaks */
function lines(items) {
	return items.map((it, i) => ({ text: typeof it === "string" ? it : it.t, options: Object.assign({ breakLine: i < items.length - 1 }, typeof it === "string" ? {} : (it.o || {})) }));
}
function bullets(slide, items, x, y, w, h, opts = {}) {
	const runs = items.map((it, i) => ({ text: typeof it === "string" ? it : it.t, options: Object.assign({ bullet: true, breakLine: i < items.length - 1 }, typeof it === "string" ? {} : (it.o || {})) }));
	slide.addText(runs, Object.assign({ x, y, w, h, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 4 }, opts));
}
function box(slide, t, x, y, w, h, opts = {}) {
	slide.addShape(pres.ShapeType.roundRect, {
		x, y, w, h, rectRadius: 0.06,
		fill: { color: opts.fill || C.background2 },
		line: { color: opts.line || HX.accent6, width: opts.lineW == null ? 0.75 : opts.lineW }
	});
	slide.addText(t, { x: x + 0.06, y, w: w - 0.12, h, fontSize: opts.fontSize || 11, bold: !!opts.bold, color: opts.color || C.text1, align: opts.align || "center", valign: "middle", margin: 0, isTextBox: true });
}
function arrow(slide, x1, y1, x2, y2, opts = {}) {
	const x = Math.min(x1, x2), y = Math.min(y1, y2);
	slide.addShape(pres.ShapeType.line, {
		x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
		flipH: x2 < x1, flipV: y2 < y1,
		line: { color: opts.color || HX.accent5, width: opts.width || 1.25, endArrowType: "triangle", dashType: opts.dash || "solid" }
	});
}
function label(slide, t, x, y, w, h = 0.3, opts = {}) {
	text(slide, t, x, y, w, h, Object.assign({ fontSize: 9, color: C.accent5, align: "center" }, opts));
}
function table(slide, header, rows, opts) {
	const hdr = header.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: HX.accent1 }, fontSize: opts.fontSize || 11, valign: "middle" } }));
	const body = rows.map((r, ri) => r.map((c) => {
		const cell = typeof c === "string" ? { text: c } : c;
		cell.options = Object.assign({ fontSize: opts.fontSize || 11, valign: "top", fill: { color: ri % 2 ? "F6F8FB" : "FFFFFF" } }, cell.options || {});
		return cell;
	}));
	slide.addTable([hdr, ...body], Object.assign({
		x: LM, w: CW, colW: opts.colW, color: HX.dk1, border: { type: "solid", pt: 0.5, color: HX.accent6 }, margin: 0.05, autoPage: false, fontFace: THEME.bodyFontFace
	}, opts, { fontSize: undefined }));
}
function refTag(slide, t = "Reference · pre-read") {
	slide.addShape(pres.ShapeType.roundRect, { x: 10.9, y: 0.52, w: 1.83, h: 0.3, rectRadius: 0.15, fill: { color: HX.lt2 }, line: { color: HX.accent6, width: 0.5 } });
	text(slide, t, 10.9, 0.52, 1.83, 0.3, { fontSize: 9, color: C.accent5, align: "center", valign: "middle" });
}
function content(title, section, opts = {}) {
	const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
	s.addText(title, { placeholder: "title" });
	if (opts.ref) refTag(s);
	return s;
}
function divider(num, title, sub, section) {
	const s = pres.addSlide({ masterName: "SECTION", sectionTitle: section });
	s.addText(num, { placeholder: "num" });
	s.addText(title, { placeholder: "title" });
	s.addText(sub, { placeholder: "sub" });
	s.addNotes(title + " – " + sub);
	return s;
}
const Q = "?"; // open-question marker in text is spelled out, not an emoji

// ============================================================================================== slides
(async () => {
	// ------------------------------------------------------------------ 0 Opening
	pres.addSection({ title: "Opening" });
	{
		const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Opening" });
		s.addText("Customer Monitor on SAP BTP", { placeholder: "title" });
		s.addText("Design review with HYDAC IT", { placeholder: "subtitle" });
		s.addText(lines(["purplecat · Igor Vorobev", "Friday, 6 November 2026 · 17:00–18:00 CET (11:00 ET)", "Pre-read: docs/11_design_review_hydac.md (sent with the invite)"]), { placeholder: "meta" });
		s.addNotes("Replacement of the SAP GUI report ZEC_CUSTOMER_MONITOR as a BTP application. 60 minutes; the pre-read carries the detail, the deck carries the decisions.");
	}
	{
		const s = content("What we will cover, and what we ask for", "Opening");
		// agenda left
		const agenda = [
			["1", "Functional design: purpose, users, use cases, data", "10"],
			["2", "Architecture, and why BTP", "5"],
			["3", "Requested elements mapped to requirements", "10"],
			["4", "Integration: Q4H/GWQ, production, Public Cloud, Magento", "10"],
			["5", "Multi-region EU · USA · AU: backends, data, users", "10"],
			["6", "Ongoing administration, decisions, next steps", "10"],
			["", "Discussion", "5"]
		];
		let y = TOP;
		for (const [n, t, m] of agenda) {
			if (n) numCircle(s, n, LM, y + 0.04, 0.4);
			text(s, t, LM + 0.55, y, 5.6, 0.48, { fontSize: 14, valign: "middle" });
			text(s, m + " min", LM + 6.2, y, 0.8, 0.48, { fontSize: 12, color: C.accent5, valign: "middle", align: "right" });
			y += 0.62;
		}
		text(s, "Sections 1 and 4 have reference slides (tagged) that we skip live; they are in the pre-read.", LM, y + 0.1, 7.0, 0.5, { fontSize: 11, color: C.accent5, italic: true });
		// ask right
		card(s, 8.2, TOP, 4.53, 2.9);
		iconCircle(s, "FiFlag", 8.4, TOP + 0.2);
		text(s, "Our ask", 9.05, TOP + 0.22, 3.5, 0.45, { fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, [
			"Agree the BTP, Git and transport setup for DEV so we can deploy, connect to Q4H/GWQ and start phase 2",
			"Take 11 decisions (D1–D11), most of them with a recommendation",
			"Nothing in the multi-region part blocks the DEV setup; it shapes D4 and D8–D10"
		], 8.4, TOP + 0.8, 4.15, 2.0, { fontSize: 12 });
		// legend
		card(s, 8.2, TOP + 3.1, 4.53, 1.75);
		text(s, "Legend", 8.4, TOP + 3.25, 2, 0.3, { fontSize: 12, bold: true, color: C.accent1 });
		const leg = [[HX.accent2, "Built and tested (phase 1)"], [HX.accent3, "Designed, not built"], [HX.accent6, "Proposal, needs agreement"], [HX.accent4, "Open question for HYDAC"]];
		leg.forEach(([hex, t], i) => { dot(s, 8.45, TOP + 3.63 + i * 0.28, hex); text(s, t, 8.7, TOP + 3.57 + i * 0.28, 3.9, 0.28, { fontSize: 11 }); });
		s.addNotes("Pete asked for four things: functional design, the mapping of each requested item, ongoing administration, integration. Sections 1, 3, 6, 4 answer them in that order; section 5 answers the follow-up on EU/USA/AU.");
	}

	// ------------------------------------------------------------------ 1 Functional design
	pres.addSection({ title: "1 Functional design" });
	divider("1", "Functional design", "Business purpose · users and roles · use cases · data · screens · lessons from the legacy report", "1 Functional design");
	{
		const s = content("Registrations become SAP master data only after a review", "1 Functional design");
		const steps = ["Magento B2B shop sends a registration", "SAP stores a request (ZEC_CUSTOMER, original + working copy)", "Approval check: rules per process type and sales org", "Back office reviews and completes the request in the monitor", "Steps create or assign BP, customer, contact person, ship-to", "SAP notifies Magento with the result"];
		const bw = (CW - 5 * 0.28) / 6;
		steps.forEach((t, i) => {
			const x = LM + i * (bw + 0.28);
			box(s, t, x, TOP + 0.1, bw, 1.05, { fontSize: 10.5, fill: i === 3 ? HX.accent1 : C.background2, color: i === 3 ? C.background1 : C.text1, bold: i === 3 });
			if (i < 5) arrow(s, x + bw + 0.03, TOP + 0.625, x + bw + 0.25, TOP + 0.625);
		});
		label(s, "The monitor is the manual step in the middle: nothing is created in SAP without it.", LM, TOP + 1.2, CW, 0.3, { align: "left", fontSize: 10, italic: true });
		const inputs = [["FiBriefcase", "Company registrations", "New companies, or companies that already exist as a customer (Debitor). Process types CR_DEB / CH_DEB."], ["FiUser", "New shop users", "Contact persons (Ansprechpartner) for an existing customer. CR_AP / CH_AP."], ["FiMapPin", "New delivery addresses", "Ship-to parties (Warenempfänger) for an existing customer. CR_WE."]];
		const cw3 = (CW - 0.6) / 3;
		for (let i = 0; i < 3; i++) {
			const x = LM + i * (cw3 + 0.3), y = TOP + 1.6;
			card(s, x, y, cw3, 1.45);
			await iconCircle(s, inputs[i][0], x + 0.2, y + 0.2, 0.5);
			text(s, inputs[i][1], x + 0.85, y + 0.22, cw3 - 1.0, 0.45, { fontSize: 14, bold: true, color: C.accent1, valign: "middle" });
			text(s, inputs[i][2], x + 0.2, y + 0.78, cw3 - 0.4, 0.6, { fontSize: 11 });
		}
		table(s, ["", "Legacy (SAP GUI report)", "New (BTP / Fiori Elements)"], [
			["Access", "SAP GUI transaction, one system", "Browser via Work Zone, one app for all regions, deep links"],
			["Work queue", "One list with filters", "Tabs with counters (My work, Errors, Clarification, Release, All), priority sort, next-step recommendation"],
			["Concurrency / authorization", "No lock on steps (duplicate customers, R-01); two sales-org checks (R-08)", "Edit lock + version check on every step; one sales-org rule, checked again by the backend"]
		], { y: TOP + 3.25, colW: [2.0, 4.2, 5.93], fontSize: 10.5 });
		s.addNotes("Source: docs/01 (Fachkonzept). The monitor never creates master data itself; it drives the steps in the backend.");
	}
	{
		const s = content("Roles define what a user may do, sales orgs what they see", "1 Functional design");
		const roles = [["FiEye", "Viewer", "Kundenmonitor_Viewer", "Sales and customer-service staff who look up requests", "Read requests of their own sales organizations", "Legacy: display"], ["FiEdit3", "Editor", "Kundenmonitor_Editor", "Back office (Innendienst) per sales organization, in EU, USA, AU", "+ edit request data, run steps", "Legacy: change"], ["FiCheckCircle", "Releaser", "Kundenmonitor_Releaser", "Users who approve requests that need a release (Freigabe)", "+ see unreleased requests, release them", "Legacy: ZEC_MONITO ACTVT 43"]];
		const cw3 = (CW - 0.6) / 3;
		for (let i = 0; i < 3; i++) {
			const x = LM + i * (cw3 + 0.3), y = TOP;
			card(s, x, y, cw3, 3.0);
			await iconCircle(s, roles[i][0], x + 0.2, y + 0.2, 0.55);
			text(s, roles[i][1], x + 0.9, y + 0.2, cw3 - 1.1, 0.35, { fontSize: 18, bold: true, color: C.accent1 });
			text(s, roles[i][2], x + 0.9, y + 0.55, cw3 - 1.1, 0.3, { fontSize: 10, color: C.accent5 });
			text(s, lines([{ t: "Who", o: { bold: true } }, roles[i][3], "", { t: "May", o: { bold: true } }, roles[i][4]]), x + 0.2, y + 0.95, cw3 - 0.4, 1.7, { fontSize: 11.5 });
			text(s, roles[i][5], x + 0.2, y + 2.65, cw3 - 0.4, 0.3, { fontSize: 10, color: C.accent5, italic: true });
		}
		card(s, LM, TOP + 3.2, CW, 1.1, { fill: HX.lt2 });
		await iconCircle(s, "FiFilter", LM + 0.2, TOP + 3.5, 0.5, HX.accent1);
		text(s, lines([{ t: "Data scope: ", o: { bold: true } }, { t: "which requests a user sees is defined by the sales organizations assigned to them, per backend (region). No assignment = sees nothing (fail closed). The same three role collections serve all regions; no region-specific roles.", o: {} }]).map((r) => { r.options.breakLine = false; return r; }), LM + 0.9, TOP + 3.35, CW - 1.1, 0.85, { fontSize: 12, valign: "middle" });
		dot(s, LM, TOP + 4.55, HX.accent4);
		text(s, "Open: number of users per role, region and sales organization, and requests per day per region (sizing, administration effort).", LM + 0.25, TOP + 4.48, CW - 0.3, 0.4, { fontSize: 11, color: C.accent5 });
		s.addNotes("Roles are in xs-security.json today (O-01). The scope mechanism (attribute or app table) is decided in D10.");
	}
	{
		const s = content("Twelve use cases, all driven by what the backend allows", "1 Functional design", { ref: true });
		const uc = [["Work the queue", "tabs with counters, priority and waiting time; own sales orgs only", "Viewer+"], ["Review a request", "main data, contact or ship-to, sales data, assignment, log", "Viewer+"], ["Correct or complete data", "draft: edit, save, cancel; lock for others; every field change logged", "Editor"], ["Release", "manual, credit card or order-volume limit per process type and sales org", "Releaser"], ["Create customer + admin", "step CREATE: BP, customer, contact person; Magento notified", "Editor"], ["Create / change contact", "step AP_MODIFY; Magento notified", "Editor"], ["Create ship-to party", "step CREATE_WE; assigned to the sold-to; Magento notified", "Editor"], ["Handle duplicates", "assign existing customer, change assignment (confirmation question), convert to new customer", "Editor"], ["Put in clarification", "mandatory comment, status unchanged", "Editor"], ["Reject", "mandatory reason (≤ 100 chars); Magento notified", "Editor"], ["Complete manually / reset", "handled outside, or reopen a closed request", "Editor"], ["Fix errors", "error status 140/150/160 with messages; correct and repeat the step", "Editor"]];
		const cols = 3, gw = (CW - 0.5) / cols, gh = 1.18;
		uc.forEach((u, i) => {
			const x = LM + (i % cols) * (gw + 0.25), y = TOP + Math.floor(i / cols) * (gh + 0.12);
			card(s, x, y, gw, gh);
			numCircle(s, i + 1, x + 0.15, y + 0.15, 0.36);
			text(s, u[0], x + 0.62, y + 0.13, gw - 1.35, 0.4, { fontSize: 12.5, bold: true, color: C.accent1, valign: "middle" });
			text(s, u[2], x + gw - 0.8, y + 0.17, 0.65, 0.3, { fontSize: 9, color: C.accent2, align: "right", bold: true });
			text(s, u[1], x + 0.15, y + 0.58, gw - 0.3, 0.58, { fontSize: 10.5, color: C.text1 });
		});
		label(s, "Which steps are allowed is decided by the backend (customizing ZEC_CUST_PROCESS + role). Each region keeps its own rules. The UI only shows what the service allows.", LM, TOP + 5.15, CW, 0.45, { align: "left", fontSize: 10.5, italic: true });
		s.addNotes("docs/11 §2.3. Reference slide.");
	}
	{
		const s = content("Process types, statuses and steps", "1 Functional design", { ref: true });
		table(s, ["Process type", "Meaning", "Start", "Typical end"], [
			["CR_DEB", "New company without SAP customer", "000 New", "CREATE → 999 Done"],
			["CH_DEB", "Company with existing customer", "000", "AP_MODIFY → 999"],
			["CR_AP", "New shop user for existing customer", "000", "AP_MODIFY → 999"],
			["CH_AP", "Change of existing contact person", "997 Automatically done", "–"],
			["CR_WE", "New delivery address", "010", "CREATE_WE → 999"]
		], { y: TOP, w: 7.2, colW: [1.3, 3.0, 1.6, 1.3], fontSize: 11 });
		card(s, 8.1, TOP, 4.63, 2.4);
		text(s, "Status groups", 8.3, TOP + 0.15, 4, 0.35, { fontSize: 14, bold: true, color: C.accent1 });
		const sg = [[HX.accent6, "Open", "0xx / 1xx"], [HX.accent4, "Error", "140, 150, 160 – a step failed"], [HX.accent5, "Rejected", "899"], [HX.accent2, "Done", "997, 998, 999"]];
		sg.forEach(([hex, t, d], i) => { dot(s, 8.35, TOP + 0.66 + i * 0.4, hex); text(s, lines([{ t: t + "  ", o: { bold: true, breakLine: false } }, { t: d, o: { breakLine: false, color: C.accent5 } }]), 8.6, TOP + 0.58 + i * 0.4, 4.0, 0.35, { fontSize: 11.5 }); });
		card(s, 8.1, TOP + 2.6, 4.63, 2.9);
		text(s, "Steps (bound actions in the service)", 8.3, TOP + 2.75, 4.3, 0.35, { fontSize: 14, bold: true, color: C.accent1 });
		bullets(s, ["CREATE, CREATE_WE, AP_MODIFY – create master data", "CHNG_OLD, CNG_DEBI, CNG_NEW – duplicates and assignment", "MANUAL_OK, REJECT – close without creation", "RELEASE, CLARIFY, RESET – fixed functions", "Confirmation questions come from the backend (OData strict handling, 412)"], 8.3, TOP + 3.15, 4.3, 2.3, { fontSize: 11 });
		text(s, "Full rules: docs/01 §3–§6 (allowed steps per process type and status, release rules per sales org, log entries).", LM, TOP + 3.1, 7.2, 0.6, { fontSize: 11, color: C.accent5, italic: true });
		s.addNotes("Reference slide. The mock service reproduces this status machine from a CSV copy of the customizing.");
	}
	{
		const s = content("The data the monitor displays and acts on", "1 Functional design", { ref: true });
		table(s, ["Entity", "Content", "Source (backend)", "Editable"], [
			["Request", "Backend/region (proposal), process type, status, source, sales org; SAP numbers; Magento IDs; order volume, currency, credit card; release (flag, procedure, reason, limit); clarification; main data (name, address, communication, VAT/tax, industry, DUNS)", "ZEC_CUSTOMER + working copy PAYLOAD_CHNG", "Main data only"],
			["Sales data", "Sales org, channel, division, sales group/office, customer group, district, Incoterms", "Payload", "Yes (except sales org)"],
			["Contact person", "Shop role, title, name, function, department, language, phone, email", "Payload", "Yes (not for CR_WE)"],
			["Ship-to", "Name, address, VAT number, address used in order", "Payload", "Yes (only CR_WE)"],
			["Log", "Message type/class/number/text, step, field, old/new value, user, time", "Monitor log", "Read-only"],
			["Code lists", "Statuses, status groups, process types, steps, release states and reasons (DE/EN, FR/IT where maintained)", "Customizing ZEC_CUST_* per backend", "Read-only"],
			["Business partner value help", "Number, name, customer, customer role, Magento company – from the request's backend only", "Business Partner API + Magento mapping", "Read-only"]
		], { y: TOP, colW: [1.9, 6.0, 2.5, 1.73], fontSize: 10 });
		card(s, LM, TOP + 4.35, CW, 1.05, { fill: HX.lt2 });
		await iconCircle(s, "FiShield", LM + 0.2, TOP + 4.62, 0.5, HX.accent1);
		text(s, "Personal data: names, email addresses and phone numbers of contact persons. From phase 2 a replica of the requests is stored in HANA Cloud on BTP; where it is stored is a data-residency question (section 5). Open: retention and deletion rules for completed requests. Multi-currency (EUR, USD, AUD) is already supported.", LM + 0.9, TOP + 4.45, CW - 1.1, 0.9, { fontSize: 11, valign: "middle" });
		s.addNotes("Reference slide. Full field list in docs/03 §1–§2.");
	}
	{
		const s = content("Two screens, annotation-driven; live demo available", "1 Functional design", { ref: true });
		const half = (CW - 0.3) / 2;
		card(s, LM, TOP, half, 4.2);
		await iconCircle(s, "FiList", LM + 0.2, TOP + 0.2);
		text(s, "List (List Report)", LM + 0.85, TOP + 0.22, half - 1.0, 0.45, { fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, ["Filter bar: search, region (proposal), status group, released, in clarification, customer, sales org, process type, status, source, order exists, created/changed", "Tabs with counters: My work · Errors · Clarification · Release · All", "Columns: status, hints (lock, clarification, order), release reason, process type, name, next step, waiting since, customer, sales org, Magento company, order volume, created, changed", "Errors highlighted red; sorted by priority, then waiting time"], LM + 0.2, TOP + 0.8, half - 0.4, 3.3, { fontSize: 11.5 });
		card(s, LM + half + 0.3, TOP, half, 4.2);
		await iconCircle(s, "FiFileText", LM + half + 0.5, TOP + 0.2);
		text(s, "Detail (Object Page)", LM + half + 1.15, TOP + 0.22, half - 1.3, 0.45, { fontSize: 16, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, ["Header: status, release, next step, key figures", "Sections: main data, contact person or ship-to (by process type), sales data, assignment, log", "Actions: Edit (draft), Run step menu (only allowed steps active), Refresh", "Dialogs: reject reason, clarification comment, business partner with value help; confirmation questions from the backend"], LM + half + 0.5, TOP + 0.8, half - 0.7, 3.3, { fontSize: 11.5 });
		text(s, "UI languages English and German (more can be added). Times in the user's local time zone. Built with SAP Fiori Elements for OData V4: ~300 lines of own UI code, everything else comes from annotations in the service.", LM, TOP + 4.4, CW, 0.7, { fontSize: 11.5, color: C.accent5 });
		s.addNotes("Reference slide. Demo: cds watch against the mock, users alice/bob/carol (docs/08).");
	}
	{
		const s = content("Legacy defects the new design must not inherit", "1 Functional design");
		table(s, ["ID", "Finding in the SAP GUI monitor", "Requirement for the new solution", "Where"], [
			["R-01", "Steps run without a lock: two users can create the same customer twice", "Version check (ETag) on every step, serialized per request in the backend", "BTP + backend"],
			["R-03 / R-04", "Notifications to Magento sent before the commit; send errors swallowed", "Notify only after commit, deduplicated; log every result", "Backend"],
			["R-05 / R-16", "Rejected address not identifiable in Magento; typo RejectCusomterSet is part of the contract", "Address-level rejection; keep the subscription name – coordinate with TechDivision", "Backend + Magento"],
			["R-07", "Release limit compared without currency conversion", "Convert, or compare only in the same currency – matters more with EUR, USD, AUD", "Backend"],
			["R-08", "Two different sales-org authorization checks", "One sales-org rule in the service, checked again by the backend", "BTP + backend"]
		], { y: TOP, colW: [1.2, 4.3, 4.6, 2.03], fontSize: 11 });
		text(s, "16 findings in total (docs/07). The ones above change the backend interface or need Magento coordination; the rest are UI or customizing fixes.", LM, TOP + 4.0, CW, 0.5, { fontSize: 11.5, color: C.accent5, italic: true });
		s.addNotes("These are the reasons the backend service cannot be a 1:1 wrapper of the old report.");
	}
	{
		const s = content("Where we stand today", "1 Functional design");
		const st = [[HX.accent2, "Phase 1 complete", "UI + mock service", ["26 test requests, 5 process types, 11 step actions", "Status machine from a copy of the S/4 customizing", "Service tests and browser UI journeys automated", "Roles, sales-org filter, draft lock, strict handling in place"]], [HX.accent2, "Deployment package ready", "MTA archive builds locally", ["Roles (xs-security.json), MTA, HANA Cloud (HDI), HTML5 repo, Work Zone tile, health check, logging", "0 deployments so far: no BTP subaccount yet", "First deployment = first end-to-end check of Work Zone, XSUAA, HANA"]], [HX.accent3, "Phase 2 designed", "S/4 connection", ["Interface draft for the S/4 service (docs/10), decision E-07 RAP vs SEGW open", "Adapter seam in the CAP service already in place", "Multi-backend routing (section 5) is a proposal"]]];
		const cw3 = (CW - 0.6) / 3;
		st.forEach(([hex, h, sub, items], i) => {
			const x = LM + i * (cw3 + 0.3);
			card(s, x, TOP, cw3, 4.4);
			dot(s, x + 0.25, TOP + 0.33, hex, 0.26);
			text(s, h, x + 0.65, TOP + 0.2, cw3 - 0.8, 0.5, { fontSize: 17, bold: true, color: C.accent1, valign: "middle" });
			text(s, sub, x + 0.65, TOP + 0.65, cw3 - 0.8, 0.3, { fontSize: 11, color: C.accent5 });
			bullets(s, items, x + 0.25, TOP + 1.1, cw3 - 0.5, 3.2, { fontSize: 11.5, paraSpaceAfter: 6 });
		});
		text(s, "The systems of record stay in SAP: request data, customizing, step logic and the notifications to Magento are not reimplemented on BTP.", LM, TOP + 4.6, CW, 0.5, { fontSize: 12, color: C.accent1, bold: true });
		s.addNotes("Nothing has been deployed because there is no subaccount. The ask in section 3 unblocks that.");
	}

	// ------------------------------------------------------------------ 2 Architecture
	pres.addSection({ title: "2 Architecture" });
	divider("2", "Architecture", "Why BTP · solution overview", "2 Architecture");
	{
		const s = content("Why BTP, and not a Fiori app inside S/4", "2 Architecture");
		const alts = [["FiServer", "Fiori Elements app inside S/4 on-premise", "RAP, embedded launchpad", ["Serves only the system it runs in", "AU requests live in S/4HANA Public Cloud: an on-premise UI cannot reach it with the user's identity, and Public Cloud cannot host the classic ABAP monitor logic", "EU and US would get the new monitor, AU would not"], false], ["FiCopy", "One app per backend", "RAP on-premise + ABAP Cloud RAP in AU", ["Two UIs and two codebases for the same process", "No common work queue, no cross-region support", "Every change twice"], false], ["FiCloud", "BTP side-by-side", "chosen", ["One UI and one service for all regions", "Each backend keeps its own data, customizing and step logic: clean core on both sides", "The price: HANA Cloud and a replica (next slide)"], true]];
		const cw3 = (CW - 0.6) / 3;
		for (let i = 0; i < 3; i++) {
			const a = alts[i], x = LM + i * (cw3 + 0.3);
			card(s, x, TOP, cw3, 4.1, a[4] ? { fill: HX.accent1, line: HX.accent1 } : {});
			await iconCircle(s, a[0], x + 0.2, TOP + 0.2, 0.55, a[4] ? HX.accent2 : HX.accent5);
			text(s, a[1], x + 0.9, TOP + 0.15, cw3 - 1.1, 0.7, { fontSize: 15, bold: true, color: a[4] ? C.background1 : C.accent1, valign: "middle" });
			text(s, a[2], x + 0.2, TOP + 0.95, cw3 - 0.4, 0.3, { fontSize: 10.5, color: a[4] ? C.accent6 : C.accent5, italic: true });
			bullets(s, a[3], x + 0.2, TOP + 1.35, cw3 - 0.4, 2.7, { fontSize: 11.5, color: a[4] ? C.background1 : C.text1, paraSpaceAfter: 6 });
		}
		text(s, "If only one on-premise S/4 were in scope, an in-S/4 RAP app would be the cheaper choice. The multi-region requirement is what makes BTP the right place.", LM, TOP + 4.35, CW, 0.6, { fontSize: 12.5, color: C.accent1 });
		s.addNotes("Expect this question from Mathias or Gareth. Answer it before the architecture picture.");
	}
	{
		const s = content("Solution architecture: backends stay the systems of record", "2 Architecture");
		// users + work zone
		box(s, "Back office\nEU · USA · AU", LM, TOP + 0.45, 2.0, 0.8, { fontSize: 11, bold: true });
		arrow(s, LM + 2.03, TOP + 0.85, LM + 2.45, TOP + 0.85);
		box(s, "SAP Build Work Zone\n(tile, Work Zone role)", LM + 2.5, TOP + 0.45, 2.5, 0.8, { fontSize: 11 });
		box(s, "Corporate IdP via\nSAP Cloud Identity Services", LM + 2.5, TOP + 1.6, 2.5, 0.8, { fontSize: 10.5, fill: "FFFFFF" });
		arrow(s, LM + 3.75, TOP + 1.58, LM + 3.75, TOP + 1.28, { dash: "dash" });
		label(s, "login, groups", LM + 3.8, TOP + 1.3, 1.3, 0.25, { align: "left" });
		// subaccount group
		const gx = 6.3, gy = TOP + 0.05, gw = 6.43, gh = 3.75;
		s.addShape(pres.ShapeType.roundRect, { x: gx, y: gy, w: gw, h: gh, rectRadius: 0.08, fill: { color: HX.lt2 }, line: { color: HX.accent6, width: 0.75 } });
		text(s, "SAP BTP subaccount · Cloud Foundry space", gx + 0.15, gy + 0.08, gw - 0.3, 0.3, { fontSize: 10.5, bold: true, color: C.accent1 });
		arrow(s, LM + 5.03, TOP + 0.85, gx - 0.05, TOP + 0.85);
		box(s, "Managed approuter\n+ HTML5 repository", gx + 0.2, gy + 0.45, 2.95, 0.75, { fontSize: 10.5, fill: "FFFFFF" });
		arrow(s, gx + 3.18, gy + 0.82, gx + 3.4, gy + 0.82);
		box(s, "Fiori Elements app\n(OData V4)", gx + 3.45, gy + 0.45, 2.78, 0.75, { fontSize: 10.5, fill: "FFFFFF" });
		arrow(s, gx + 4.84, gy + 1.22, gx + 4.84, gy + 1.45);
		box(s, "CAP service (Node.js) – stable OData V4 contract, authorization (role + sales org), facade + backend router", gx + 0.2, gy + 1.5, 6.03, 0.75, { fontSize: 10.5, fill: HX.accent1, color: C.background1, bold: true });
		const bw3 = (6.03 - 0.3) / 3;
		["HANA Cloud (HDI)\ndrafts + replica", "XSUAA\nroles + SalesOrg", "Destination +\nConnectivity"].forEach((t, i) => {
			const x = gx + 0.2 + i * (bw3 + 0.15);
			arrow(s, x + bw3 / 2, gy + 2.27, x + bw3 / 2, gy + 2.6);
			box(s, t, x, gy + 2.65, bw3, 0.8, { fontSize: 10.5, fill: "FFFFFF" });
		});
		// backends row
		const by = TOP + 4.25, bh = 0.8;
		box(s, "S/4HANA on-premise\nQ4H (EU, + USA ?)", LM, by, 2.6, bh, { fontSize: 10.5, bold: true });
		box(s, "GWQ – Gateway\n(assumption)", 3.5, by, 2.3, bh, { fontSize: 10.5 });
		box(s, "SAP Cloud Connector\n(HYDAC network)", 6.3, by, 2.4, bh, { fontSize: 10.5 });
		box(s, "S/4HANA Public Cloud\nHYDAC Australia", 10.1, by, 2.63, bh, { fontSize: 10.5, bold: true });
		const dx = gx + 0.2 + 2 * (bw3 + 0.15) + bw3 / 2; // destination centre
		arrow(s, dx, gy + 3.47, 7.5, by - 0.03);
		arrow(s, gx + 0.2 + 2 * (bw3 + 0.15) + bw3, gy + 3.1, 11.4, by - 0.03);
		label(s, "internet, communication arrangement", 10.0, TOP + 3.9, 2.73, 0.25, { align: "right" });
		arrow(s, 6.27, by + bh / 2, 5.83, by + bh / 2);
		arrow(s, 3.47, by + bh / 2, 3.23, by + bh / 2);
		text(s, "Magento shops send registrations to, and receive notifications from, each backend – unchanged by the monitor. Why a replica: CAP's draft lock and version checks need local tables; a pure pass-through would fail on every edit and every step (E-12, E-14).", LM, by + 0.88, CW, 0.45, { fontSize: 10, color: C.accent5 });
		s.addNotes("Phases: 1 UI + mock (done) → 2 S/4 on-premise on Q4H/GWQ → 2b further backends (AU, US?) → 3 production.");
	}

	// ------------------------------------------------------------------ 3 Requested elements
	pres.addSection({ title: "3 Requested elements" });
	divider("3", "Requested elements mapped to requirements", "Entitlements · space and roles · connectivity · Git · transport", "3 Requested elements");
	{
		const s = content("Entitlements: each one serves a named requirement", "3 Requested elements");
		table(s, ["Entitlement", "Requirement", "Why it is needed", "Needed from", "If not granted"], [
			["Cloud Foundry Runtime (MEMORY), 2–4 GB", "Access, Integration", "Runs the CAP service (≈ 256–512 MB), HDI deployer and content deployers; headroom for zero-downtime redeploys", "First deployment", "No deployment possible"],
			["SAP HANA Cloud (hana-cloud / hana + tools)", "Persistence", "Database instance for the HDI container: drafts and replica", "First deployment", "Not usable on BTP without it. Main cost item; a shared existing instance would save it. Stop non-productive instances off-hours"],
			["SAP HANA Schemas & HDI Containers (hdi-shared)", "Persistence", "The application's own schema in that instance", "First deployment", "as above"],
			["Continuous Integration and Delivery (cicd-app)", "Delivery", "Build on every push, lint + tests, deploy to DEV, upload to cTMS", "When Git is set up", "GitHub Actions + cf CLI instead (pipeline to maintain)"],
			["SAP Build Work Zone, standard (SAPLaunchpad)", "Access", "Entry point: tile, role-based visibility, later navigation to Manage Business Partners", "Before user tests", "Direct app URL. Existing Work Zone site can be reused"],
			["Cloud Transport Management (transport)", "Delivery", "Same archive DEV → QAS → PRD with approval and audit trail via the existing cTMS tenant", "Before QAS exists", "Manual cf deploy per space"]
		], { y: TOP, colW: [2.5, 1.35, 3.55, 1.35, 3.38], fontSize: 10 });
		text(s, "Already entitled in FSM-DEV-CPI: xsuaa (login, roles, SalesOrg) · destination (UI → CAP, one destination per backend) · connectivity (Cloud Connector tunnel) · html5-apps-repo (UI hosting) · application-logs / Cloud Logging (optional binding in the MTA). Not requested yet, needed for user management: SAP Cloud Identity Services – HYDAC probably has a tenant already.", LM, TOP + 4.55, CW, 0.85, { fontSize: 10.5, color: C.accent5 });
		s.addNotes("Requirements: Access, Persistence, Integration, Security, Delivery, Operation, Version control (docs/11 §4).");
	}
	{
		const s = content("Space, roles and connectivity: least privilege is fine", "3 Requested elements");
		table(s, ["Item", "Requirement", "Why", "Least-privilege alternative"], [
			["CF space cap-monitor (DEV)", "all", "Isolated runtime for app and service instances", "–"],
			["Space Developer (purplecat)", "Delivery", "Deploy the MTA, create instances in the space, read logs", "needed"],
			["Org Manager", "–", "Only to create spaces ourselves", { text: "Not needed if HYDAC creates the spaces – we drop it", options: { bold: true, color: HX.accent2 } }],
			["Subaccount Service Administrator", "Access, Delivery", "Subscriptions (Work Zone, CI/CD, cTMS) and service instances", { text: "HYDAC admin does the one-time subscriptions; afterwards Space Developer is enough", options: { bold: true, color: HX.accent2 } }],
			["App role collections for test users", "Security", "Testing role and sales-org behaviour", "Assigned by HYDAC or us"],
			["Work Zone / CI/CD / cTMS roles", "Access, Delivery", "Tile and site; pipeline; upload and tracking", "Imports into QAS/PRD stay with HYDAC"]
		], { y: TOP, w: 7.4, colW: [2.0, 1.15, 2.2, 2.05], fontSize: 10 });
		card(s, 8.3, TOP, 4.43, 4.9);
		await iconCircle(s, "FiLink", 8.5, TOP + 0.2);
		text(s, "Connectivity to Q4H / GWQ", 9.15, TOP + 0.22, 3.4, 0.45, { fontSize: 15, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, [{ t: "GWQ exposed via Cloud Connector (or a destination for it): the monitor's OData service runs where HYDAC publishes Gateway services", o: {} }, "Cloud Connector resources: the monitor's OData paths + API_BUSINESS_PARTNER; exact list after decision E-07 (section 4)", "Authentication: principal propagation recommended; technical user only for the first DEV tests", "S/4 test users for purplecat developers (incl. ADT, if purplecat builds the S/4 service – open who does)"], 8.5, TOP + 0.85, 4.05, 3.9, { fontSize: 11.5, paraSpaceAfter: 7 });
		s.addNotes("The two green cells are the change from the original email: no Org Manager, no Subaccount Service Administrator for daily work.");
	}
	{
		const s = content("Git and transport: one organization, one archive", "3 Requested elements");
		card(s, LM, TOP, 6.5, 5.1);
		await iconCircle(s, "FiGithub", LM + 0.2, TOP + 0.2);
		text(s, "GitHub (github.com), HYDAC-owned", LM + 0.85, TOP + 0.22, 5.4, 0.45, { fontSize: 15, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, ["Why github.com: Integration Suite's built-in Git integration supports only github.com (not GitHub Enterprise Server, GitLab, Bitbucket, Azure DevOps)", "Repositories cap-monitor and cpi-iflows: one per lifecycle; HYDAC owns the code", "Write access for purplecat developers; branch protection and reviews as HYDAC requires", "Fine-grained personal access tokens with expiry (Integration Suite asks for one on every push/pull)", "Read-only technical access + webhook to BTP CI/CD: builds start on push", "Integration Suite tenant admin registers the repositories (Settings → Integrations → Git Access)", { t: "Limitation: the built-in feature covers iFlows only, not message mappings or script collections", o: { color: C.accent5, italic: true } }], LM + 0.2, TOP + 0.8, 6.1, 4.2, { fontSize: 11.5, paraSpaceAfter: 6 });
		// flow
		const fx = 7.5;
		box(s, "Developer\npush", fx, TOP, 1.5, 0.7, { fontSize: 10.5 });
		arrow(s, fx + 1.53, TOP + 0.35, fx + 1.77, TOP + 0.35);
		box(s, "GitHub\nHYDAC org", fx + 1.8, TOP, 1.5, 0.7, { fontSize: 10.5 });
		arrow(s, fx + 3.33, TOP + 0.35, fx + 3.57, TOP + 0.35);
		box(s, "BTP CI/CD\nbuild · lint · tests", fx + 3.6, TOP, 1.63, 0.7, { fontSize: 10.5, fill: HX.accent1, color: C.background1, bold: true });
		arrow(s, fx + 4.4, TOP + 0.73, fx + 4.4, TOP + 1.07);
		box(s, "DEV space\ncf deploy", fx + 3.6, TOP + 1.1, 1.63, 0.7, { fontSize: 10.5 });
		arrow(s, fx + 3.6, TOP + 0.6, fx + 2.55, TOP + 1.07);
		box(s, "cTMS ctms-hydac\nupload .mtar", fx + 1.8, TOP + 1.1, 1.5, 0.7, { fontSize: 10.5 });
		arrow(s, fx + 2.55, TOP + 1.83, fx + 2.55, TOP + 2.17);
		label(s, "import, HYDAC approves", fx + 3.35, TOP + 1.85, 1.9, 0.3, { align: "left" });
		box(s, "QAS space", fx + 1.8, TOP + 2.2, 1.5, 0.6, { fontSize: 10.5 });
		arrow(s, fx + 2.55, TOP + 2.83, fx + 2.55, TOP + 3.17);
		label(s, "forward, HYDAC approves", fx + 3.35, TOP + 2.85, 1.9, 0.3, { align: "left" });
		box(s, "PRD space(s)", fx + 1.8, TOP + 3.2, 1.5, 0.6, { fontSize: 10.5, bold: true });
		card(s, fx, TOP + 4.0, 5.23, 1.1, { fill: HX.lt2 });
		text(s, lines([{ t: "cTMS: ", o: { bold: true, breakLine: false } }, { t: "confirm the owner of tenant ctms-hydac (eu10) and reuse; one node per space, space-specific values via MTA extension descriptors, never a rebuilt archive; export roles for purplecat, import roles stay with HYDAC.", o: { breakLine: false } }]), fx + 0.15, TOP + 4.08, 4.95, 0.95, { fontSize: 10.5, valign: "middle" });
		s.addNotes("With regional deployments (section 5) there is one PRD node per region; same archive.");
	}

	// ------------------------------------------------------------------ 4 Integration
	pres.addSection({ title: "4 Integration" });
	divider("4", "Integration", "Q4H / GWQ and production · interfaces · Cloud Connector · authentication · Public Cloud · Magento · Integration Suite", "4 Integration");
	{
		const s = content("Landscape and the backend contract", "4 Integration");
		table(s, ["BTP stage", "Backend EU (on-premise)", "Backend USA", "Backend AU (Public Cloud)"], [
			["DEV (now)", "Q4H via GWQ", "? same S/4 as EU, or own system", "? AU test tenant"],
			["QAS", "Q4H (? or a separate test client)", "?", "? AU test tenant"],
			["PRD", "? production S/4 + Gateway", "?", "? AU production tenant"]
		], { y: TOP, w: 5.6, colW: [1.1, 1.7, 1.4, 1.4], fontSize: 10 });
		text(s, "Assumption: Q4H holds ZEC_CUSTOMER*, customizing and step classes; GWQ is the Gateway hub where OData services such as ZEC_CUSTOMER_CREATE_SRV are published to Magento. Same archive on every stage; only the destinations differ.", LM, TOP + 1.65, 5.6, 1.1, { fontSize: 10.5, color: C.accent5 });
		table(s, ["ID", "Interface", "Dir.", "Content"], [
			["I-01", "Requests: list, detail, delta (changed since)", "←", "Header, sales data, contact, ship-to, log, version counter"],
			["I-02", "Customizing", "←", "Allowed steps, approval rules, texts"],
			["I-03", "GetFunctions", "←", "Allowed steps for the current user"],
			["I-04", "ExecuteFunction", "→", "Step, version, reason / BP / confirm → result + messages; reuses the step classes without GUI popups"],
			["I-05", "ChangeData", "→", "Changed fields + version → change log"],
			["I-06", "Business partner value help", "←", "Standard API_BUSINESS_PARTNER"]
		], { x: 6.5, y: TOP, w: 6.23, colW: [0.6, 2.2, 0.45, 2.98], fontSize: 10 });
		card(s, LM, TOP + 2.9, CW, 2.2, { fill: HX.lt2 });
		await iconCircle(s, "FiGitMerge", LM + 0.2, TOP + 3.1, 0.5, HX.accent1);
		text(s, "I-01 … I-05 form the backend contract: every backend the monitor connects to must provide it. All calls are OData over HTTPS (CAP → Destination → Connectivity → Cloud Connector → Gateway → S/4); no RFC from BTP. Magento → S/4 registrations and S/4 → Magento notifications stay unchanged.", LM + 0.9, TOP + 3.0, CW - 1.1, 0.95, { fontSize: 11.5 });
		text(s, lines([{ t: "Decision E-07 (open): RAP (OData V4) or SEGW (OData V2) for the new S/4 service. ", o: { bold: true, breakLine: false } }, { t: "Recommendation RAP if the S/4 release allows it: clean core, typed actions, and the same service design can be built in ABAP Cloud for Australia, where SEGW does not exist. CAP consumes both equally well. Needed: S/4 release of Q4H, HYDAC's ABAP guidelines, and who builds it.", o: { breakLine: false } }]), LM + 0.9, TOP + 4.0, CW - 1.1, 1.05, { fontSize: 11 });
		s.addNotes("docs/10 has the full draft of the S/4 service including the version counter and error mapping.");
	}
	{
		const s = content("Cloud Connector resources and authentication", "4 Integration");
		table(s, ["Virtual host", "Path prefix (examples until E-07 is decided)", "Purpose"], [
			["gwq-virtual:443 (HTTPS)", "/sap/opu/odata4/sap/zec_customer_monitor/ (RAP)  or  /sap/opu/odata/sap/ZEC_CUSTOMER_MONITOR_SRV/ (SEGW)", "I-01 … I-05"],
			["same", "/sap/opu/odata/sap/API_BUSINESS_PARTNER/", "I-06"]
		], { y: TOP, colW: [2.4, 7.6, 2.13], fontSize: 10.5 });
		text(s, "Access policy: path and all sub-paths for exactly these prefixes, nothing else.", LM, TOP + 1.25, CW, 0.3, { fontSize: 10.5, color: C.accent5, italic: true });
		table(s, ["Hop", "Mechanism"], [
			["User → Work Zone / app", "Corporate identity provider via SAP Cloud Identity Services (? Entra ID) → XSUAA, role collections"],
			["UI → CAP", "OAuth token forwarded by the managed approuter"],
			["CAP → S/4 on-premise", { text: "Principal propagation (recommended): Cloud Connector issues a short-lived X.509 certificate for the logged-in user, S/4 maps it (CERTRULE). Alternative: technical user", options: { bold: true } }],
			["CAP → S/4HANA Public Cloud", "Communication arrangement in the AU tenant; user propagation via OAuth 2.0 SAML bearer assertion"],
			["CAP → backend, delta sync of the replica", "Runs inside the user's request with the same principal propagation – no technical user that can read every request. Optional nightly resync with a read-only communication user"]
		], { y: TOP + 1.65, w: 7.6, colW: [2.2, 5.4], fontSize: 10 });
		card(s, 8.5, TOP + 1.65, 4.23, 3.5);
		await iconCircle(s, "FiKey", 8.7, TOP + 1.85);
		text(s, "Why principal propagation", 9.35, TOP + 1.87, 3.2, 0.45, { fontSize: 14, bold: true, color: C.accent1, valign: "middle" });
		bullets(s, ["The backend checks the sales-org authorization of the real user (R-08) – on reads and writes", "Change documents, monitor log and created master data show the real user", "No shared password to rotate", "Pragmatic start: technical user on DEV for connectivity tests, principal propagation before user tests on QAS"], 8.7, TOP + 2.45, 3.85, 2.6, { fontSize: 11, paraSpaceAfter: 6 });
		s.addNotes("HYDAC effort for principal propagation: Cloud Connector trust (system certificate, CA), certificate mapping in GWQ/Q4H, user mapping rule (email → S/4 user).");
	}
	{
		const s = content("Magento, S/4HANA Public Cloud, Integration Suite iFlows", "4 Integration", { ref: true });
		const cw3 = (CW - 0.6) / 3;
		const cols = [["FiShoppingCart", "Magento", ["No change for the EU flow in phase 2: registrations still arrive in S/4, notifications still go from S/4 to Magento; the monitor never calls Magento", "Each backend notifies its own shop – ? separate Magento instances for US and AU, and how AU registrations reach the Public Cloud today", "Coordination with TechDivision: address-level rejection (R-05), keep RejectCusomterSet (R-16), notify after commit (R-03)"]], ["FiCloud", "Public Cloud: what is different", ["Internet, no Cloud Connector; communication arrangement; SAML bearer for user propagation", "No classic ABAP: only ABAP Cloud (developer extensibility, RAP) or side-by-side on BTP", "Released APIs only for master data (Business Partner, customer, contact person)", "No RFC for custom logic"]], ["FiRepeat", "Integration Suite iFlows", ["The monitor's runtime calls do not go through Integration Suite: synchronous UI calls with user context; an iFlow would add latency without benefit", "Relevant for: the Magento ↔ backend flows if routed there today (? confirm), the AU option B, and reliable notifications with retry (R-03/R-04)", "Version control: iFlows in cpi-iflows next to cap-monitor"]]];
		for (let i = 0; i < 3; i++) {
			const x = LM + i * (cw3 + 0.3);
			card(s, x, TOP, cw3, 5.1);
			await iconCircle(s, cols[i][0], x + 0.2, TOP + 0.2);
			text(s, cols[i][1], x + 0.85, TOP + 0.22, cw3 - 1.0, 0.45, { fontSize: 14, bold: true, color: C.accent1, valign: "middle" });
			bullets(s, cols[i][2], x + 0.2, TOP + 0.85, cw3 - 0.4, 4.1, { fontSize: 11, paraSpaceAfter: 7 });
		}
		s.addNotes("Reference slide; the AU design itself is in section 5.");
	}

	// ------------------------------------------------------------------ 5 Multi-region
	pres.addSection({ title: "5 Multi-region" });
	divider("5", "Multi-region: EU · USA · Australia", "Backends · deployment and data residency · what a user can see and change · user management", "5 Multi-region");
	{
		const s = content("One UI, one contract, one adapter per backend", "5 Multi-region");
		box(s, "Fiori app\n(same for all regions)", LM, TOP + 1.05, 2.0, 0.9, { fontSize: 11 });
		arrow(s, LM + 2.03, TOP + 1.5, LM + 2.37, TOP + 1.5);
		box(s, "CAP service\nauthorization · routing", LM + 2.4, TOP + 1.05, 2.3, 0.9, { fontSize: 11, fill: HX.accent1, color: C.background1, bold: true });
		arrow(s, LM + 3.55, TOP + 1.97, LM + 3.55, TOP + 2.57);
		box(s, "Replica in HANA – all backends,\ntagged with backend ID", LM + 2.4, TOP + 2.6, 2.3, 0.9, { fontSize: 10.5 });
		arrow(s, LM + 4.73, TOP + 1.5, LM + 5.07, TOP + 1.5);
		box(s, "Backend registry\nbackend ID → adapter + destination", LM + 5.1, TOP + 1.05, 2.3, 0.9, { fontSize: 10.5 });
		const rows = [["EU", "Adapter S/4 on-premise", "Destination S4_EU\nCloud Connector", "S/4 Q4H / PRD"], ["US ?", "same adapter", "Destination S4_US", "S/4 USA ?"], ["AU", "Adapter (same contract)", "Destination S4_AU\ninternet", "S/4HANA Public Cloud"]];
		rows.forEach((r, i) => {
			const y = TOP + 0.1 + i * 1.15;
			arrow(s, LM + 7.43, TOP + 1.5, LM + 7.85, y + 0.4);
			text(s, r[0], LM + 7.9, y, 0.55, 0.8, { fontSize: 11, bold: true, color: C.accent1, valign: "middle" });
			box(s, r[1], LM + 8.45, y, 1.3, 0.8, { fontSize: 9.5 });
			arrow(s, LM + 9.78, y + 0.4, LM + 9.92, y + 0.4);
			box(s, r[2], LM + 9.95, y, 1.3, 0.8, { fontSize: 9.5 });
			arrow(s, LM + 11.28, y + 0.4, LM + 11.42, y + 0.4);
			box(s, r[3], LM + 11.45, y, 0.68, 0.8, { fontSize: 9, bold: true });
		});
		const half = (CW - 0.3) / 2;
		bullets(s, [{ t: "Backend ID per request (backendSystem: EU, US, AU): read-only, a filter and column Region – a small extension of the service contract", o: {} }, "Backend registry is configuration, not code: a new region = one entry + one destination, no change to the app; builds on the adapter seam already in the CAP service", "Rules per backend: allowed steps, approval rules and texts cached per backend; each region keeps its own customizing"], LM, TOP + 3.65, half, 1.85, { fontSize: 11, paraSpaceAfter: 5 });
		bullets(s, ["Reading: list and counters from the replica – one list across all backends, filtered by the user's sales orgs; delta sync per backend in the user's session", "Writing: every step and save goes to the request's backend, as the real user; value help searches that backend only", "Isolation: an unreachable backend does not stop the others; its requests stay visible, steps fail with BACKEND_UNAVAILABLE"], LM + half + 0.3, TOP + 3.65, half, 1.85, { fontSize: 11, paraSpaceAfter: 5 });
		s.addNotes("If the USA runs on the same S/4 as Europe, it is only more sales orgs in the same backend – no extra integration.");
	}
	{
		const s = content("Australia: two ways to provide the backend contract", "5 Multi-region");
		table(s, ["", "Option A (recommended): request handling in the AU Public Cloud", "Option B: request handling on BTP for AU"], [
			["Idea", "Rebuild the monitor backend in ABAP Cloud in the AU tenant (developer extensibility): intake from Magento AU, request store, approval check, step logic on the released Public Cloud APIs, notifications to Magento – and on top the backend contract as a RAP service", "The BTP replica becomes the system of record for AU. Magento sends registrations to BTP (directly or via an iFlow), the steps call the released Public Cloud APIs from BTP, notifications go back via iFlows"],
			["Monitor side", "Same adapter as EU, only another destination", "Second adapter type with its own step logic in CAP"],
			["Consistency", "Same architecture for all regions: the backend is the system of record", "AU differs from EU / US"],
			["Prerequisites", "Developer extensibility (3-system landscape) in the AU tenant; ABAP Cloud development capacity", "Magento AU → BTP interface; notifications via iFlows"],
			["Size", "Large: the on-premise monitor backend, built once more in ABAP Cloud", "Large: intake and step logic in CAP, integration flows in Integration Suite"],
			["Effect on E-07", "Strong argument for RAP in EU too (one design)", "none"]
		], { y: TOP, colW: [1.5, 5.6, 5.03], fontSize: 10.5 });
		card(s, LM, TOP + 4.1, CW, 1.1, { fill: HX.lt2 });
		dot(s, LM + 0.25, TOP + 4.5, HX.accent4, 0.22);
		text(s, "Both options assume that AU wants the review-before-create process at all; if Magento AU creates customers directly today, that is a business decision for AU before any technical one. Proposal: a short workshop with Gareth on scope, AU sales orgs, the current Magento AU flow and developer extensibility. Effort estimate only after that.", LM + 0.65, TOP + 4.2, CW - 0.85, 0.9, { fontSize: 11.5, valign: "middle" });
		s.addNotes("Decision D9. The current Magento AU → Public Cloud flow is unknown to us.");
	}
	{
		const s = content("Deployment: central or regional – data residency decides", "5 Multi-region");
		const half = (CW - 0.3) / 2;
		const opts = [["FiGlobe", "Central (one deployment)", ["One subaccount (e.g. EU region), one app, one HANA Cloud, all backends registered", "Replica of all regions in one BTP region", "One URL / tile for everyone, cross-region support possible", "1× HANA Cloud, 1× deployment", "Needs the multi-backend routing"]], ["FiMap", "Regional (one deployment per region)", ["Same archive in one subaccount per region (EU, US, AU), each with its own backend(s) and HANA Cloud", "Each region's data stays in its BTP region (e.g. Sydney for AU)", "One tile per region (can sit in one Work Zone site)", "3× HANA Cloud, 3× deployments, one cTMS route per region", "Works without routing; routing still possible"]]];
		for (let i = 0; i < 2; i++) {
			const x = LM + i * (half + 0.3);
			card(s, x, TOP, half, 3.6);
			await iconCircle(s, opts[i][0], x + 0.2, TOP + 0.2);
			text(s, opts[i][1], x + 0.85, TOP + 0.22, half - 1.0, 0.45, { fontSize: 15, bold: true, color: C.accent1, valign: "middle" });
			bullets(s, opts[i][2], x + 0.2, TOP + 0.85, half - 0.4, 2.7, { fontSize: 11.5, paraSpaceAfter: 6 });
		}
		card(s, LM, TOP + 3.8, CW, 1.45, { fill: HX.accent1, line: HX.accent1 });
		text(s, lines([{ t: "Recommendation: central, on the condition ", o: { bold: true, breakLine: false } }, { t: "that HYDAC data protection confirms AU contact data may be stored in an EU BTP region (Australian Privacy Principle 8 restricts cross-border disclosure of personal information). If not: regional for AU – one more subaccount and HANA Cloud instance, same archive – and central for EU and US. To decide before the productive subaccount is created.", o: { breakLine: false } }]), LM + 0.3, TOP + 3.9, CW - 0.6, 1.25, { fontSize: 12.5, color: C.background1, valign: "middle" });
		s.addNotes("Decision D8. The code supports both with the same archive.");
	}
	{
		const s = content("What a user can see and change: five layers", "5 Multi-region");
		const layers = [["Login", "Corporate IdP → Identity Services → XSUAA", "Only HYDAC users; the Work Zone tile is visible only with the Work Zone content role for the monitor"], ["Function", "Role collection Viewer / Editor / Releaser", "Read; edit and run steps; release"], ["Rows", "Sales-org assignment per backend: app table UserAssignments, or IAS attribute SalesOrg with backend-qualified values (EU-0001, AU-xxxx)", "Which requests are visible: list, counters, detail, sub-data, log, value helps. Enforced in the CAP service on every read – built today with the attribute, one backend. The region follows from the assignment"], ["Release", "Releaser role", "Unreleased requests are visible only to releasers – built"], ["Backend check", "Principal propagation: on-premise via Cloud Connector, Public Cloud via SAML bearer", "Every delta read, step and save runs in the backend as the real user, so the backend checks the sales org as well. No technical user with read access to all requests"]];
		layers.forEach((l, i) => {
			const y = TOP + i * 0.78;
			numCircle(s, i + 1, LM, y + 0.15, 0.42, i === 2 || i === 4 ? HX.accent2 : HX.accent1);
			text(s, l[0], LM + 0.55, y + 0.12, 1.3, 0.5, { fontSize: 12.5, bold: true, color: C.accent1, valign: "middle" });
			text(s, l[1], LM + 1.9, y + 0.02, 3.3, 0.74, { fontSize: 10, color: C.accent5, valign: "middle" });
			text(s, l[2], LM + 5.3, y + 0.02, 6.83, 0.74, { fontSize: 10.5, valign: "middle" });
			if (i < 4) s.addShape(pres.ShapeType.line, { x: LM, y: y + 0.76, w: CW, h: 0, line: { color: HX.accent6, width: 0.5 } });
		});
		table(s, ["User", "Roles", "Backend: sales orgs", "Sees"], [
			["Back office Germany", "Editor", "EU: 0001, 2000", "Open EU requests of 0001/2000, can run steps"],
			["Back office USA", "Editor, Releaser", "US: xxxx", "US requests incl. unreleased ones, can release"],
			["Back office Australia", "Editor", "AU: xxxx", "AU requests only"],
			["Global support", "Viewer", "all backends, all sales orgs", "Everything, read only"]
		], { y: TOP + 4.0, colW: [2.3, 1.8, 2.6, 5.43], fontSize: 10 });
		s.addNotes("Why per backend: the same sales-org code can exist in two backends with a different meaning. If HYDAC confirms codes are unique across systems, plain codes suffice (question 5).");
	}
	{
		const s = content("User management: roles from the IdP, scope in the monitor", "5 Multi-region");
		// flow top
		box(s, "Corporate IdP\n(? Entra ID)", LM, TOP, 2.0, 0.8, { fontSize: 10.5 });
		arrow(s, LM + 2.03, TOP + 0.4, LM + 2.37, TOP + 0.4);
		box(s, "SAP Cloud Identity Services\n(Identity Authentication)", LM + 2.4, TOP, 2.6, 0.8, { fontSize: 10.5 });
		arrow(s, LM + 5.03, TOP + 0.4, LM + 5.37, TOP + 0.4);
		box(s, "BTP subaccount: groups → role collections\nKundenmonitor_Viewer / _Editor / _Releaser", LM + 5.4, TOP, 3.6, 0.8, { fontSize: 10.5, fill: HX.accent1, color: C.background1, bold: true });
		box(s, "Regional key user (MonitorAdmin)\nadmin screen in the monitor → sales orgs per user", LM + 9.3, TOP, 2.83, 0.8, { fontSize: 10, fill: HX.lt2 });
		// options
		const half = (CW - 0.3) / 2;
		const o1 = [LM, "Option 1 – scope in IAS, set from the monitor via the SCIM API", ["+ One source for identity, roles and scope; existing CAP filter unchanged; visible in the IAS console", "– The CAP service holds a tenant-wide Manage Users credential; the IAS tenant is probably shared with other HYDAC apps and the AU Public Cloud", "– Effective only at the next token; custom attributes 1–10 are single-valued (multi-valued custom schema or a delimited string needed)", "– Attribute source Identity Provider documented for SAML trust, to confirm for OIDC"]];
		const o2 = [LM + half + 0.3, "Option 2 – scope in an app table, roles in IAS (recommended)", ["+ No IAS credential in the application; immediate effect; per-backend values and regional delegation are trivial; change log in the app", "+ Nothing to verify in the IdP setup", "– Scope lives in the app, identity and roles in IAS: two places, one authorization matrix (role × region × sales org) owned by HYDAC", "– The user must exist (first login, or the admin enters the email in advance)"]];
		for (const [x, h, items] of [o1, o2]) {
			const rec = h.includes("recommended");
			card(s, x, TOP + 1.0, half, 3.15, rec ? { fill: "FFFFFF", line: HX.accent2, lineW: 1.5 } : {});
			text(s, h, x + 0.2, TOP + 1.1, half - 0.4, 0.5, { fontSize: 13, bold: true, color: rec ? C.accent2 : C.accent1, valign: "middle" });
			bullets(s, items, x + 0.2, TOP + 1.65, half - 0.4, 2.45, { fontSize: 10.5, paraSpaceAfter: 5 });
		}
		text(s, lines([{ t: "The deciding factor is the credential: ", o: { bold: true, breakLine: false } }, { t: "a tenant-wide Manage Users secret inside a business application is a finding in any security review, and it buys nothing the table does not give faster and per backend. Both building blocks are documented by SAP, not yet tried in a HYDAC tenant. To confirm in the identity setup: SAML or OIDC trust and attribute pass-through; multi-valued custom-schema attribute in the assertion; which IAS tenant, shared with the AU Public Cloud? Users are never created from the application; they come from the corporate IdP. Backend users (SU01 / business users) and their authorizations stay with HYDAC's processes.", o: { breakLine: false } }]), LM, TOP + 4.3, CW, 1.1, { fontSize: 10.5 });
		s.addNotes("Decision D10. Interim for the first DEV test users: static role collections with sales orgs maintained in the BTP cockpit.");
	}

	// ------------------------------------------------------------------ 6 Administration and decisions
	pres.addSection({ title: "6 Administration and decisions" });
	divider("6", "Administration, decisions, next steps", "Who owns what · eleven decisions · open questions · next steps", "6 Administration and decisions");
	{
		const s = content("Ongoing administration: who owns what", "6 Administration and decisions");
		table(s, ["Area", "Task", "Frequency", "Proposed owner", "Owner (HYDAC)"], [
			["Users & roles", "Role groups in the corporate IdP; sales-org assignment in the monitor's admin screen; IdP ↔ IAS ↔ BTP trust; authorization matrix review", "On joiner/mover/leaver · quarterly", "Regional key users · HYDAC IT (identity)", ""],
			["Work Zone", "Site, tile, roles; refresh the content provider after a deployment", "Per release", "HYDAC BTP admin", ""],
			["Cloud Connector", "Operation, upgrades, resources (paths), certificates for principal propagation", "Quarterly / on expiry", "HYDAC Basis", ""],
			["Destinations / backends", "One destination per backend and stage; registry entry for a new backend; AU communication arrangement and users", "On change / rotation", "HYDAC BTP admin · HYDAC Australia IT", ""],
			["HANA Cloud", "Size, start/stop of non-productive instances, upgrade windows (SAP-managed backups)", "Monthly check", "HYDAC BTP admin", ""],
			["Application", "Health, logs, alerts, sync status per backend; CAP/UI5/Node.js updates; cTMS upload and import approval", "Continuous · quarterly · per release", "purplecat (AMS) · HYDAC approval", ""],
			["CI/CD & GitHub", "Pipeline, credentials; organization members, branch protection, token rotation (90 days)", "On change / expiry", "purplecat · HYDAC IT", ""],
			["Backends", "Customizing ZEC_CUST_* per backend; backend service and step logic; S/4 authorizations and user mapping", "On business change · per release", "HYDAC SAP team per region · purplecat", ""],
			["Integration Suite", "Monitor iFlows (Magento, AU); Git repository registration", "Continuous / one-time", "HYDAC integration team", ""],
			["Business & data protection", "First-level support, business rules; retention and deletion, data residency", "Continuous · yearly", "HYDAC key users · data protection + IT", ""],
			["Cost & entitlements", "Consumption (HANA Cloud, CF memory, Work Zone), quotas", "Monthly", "HYDAC IT", ""]
		], { y: TOP, colW: [1.7, 4.9, 1.75, 2.35, 1.43], fontSize: 9.5 });
		s.addNotes("Decision D11: HYDAC fills the last column. Full table in docs/11 §7.");
	}
	{
		const s = content("Eleven decisions we ask HYDAC to take", "6 Administration and decisions");
		table(s, ["#", "Decision", "Our recommendation"], [
			["D1", "Subaccount for development: FSM-DEV-CPI or dedicated; target subaccounts for QAS/PRD", "DEV in FSM-DEV-CPI; separate QAS/PRD subaccounts for the app"],
			["D2", "Scope of purplecat's BTP roles", "Space Developer + one-time subscriptions by HYDAC (no Org Manager)"],
			["D3", "Authentication CAP → backends", "Principal propagation for reads and writes; technical user only for the first DEV connectivity tests"],
			["D4", "S/4 service technology (E-07) and who builds it", "RAP, also because it can be reused for Australia"],
			["D5", "Git platform and organization", "GitHub (github.com), HYDAC-owned organization"],
			["D6", "Reuse of cTMS tenant ctms-hydac", "Yes, with nodes DEV → QAS → PRD"],
			["D7", "HANA Cloud: new or shared existing instance", "Shared instance if one exists"],
			["D8", "Central or regional deployment (data residency)", "Central, unless data protection requires regional for AU"],
			["D9", "Australia: option A (RAP in Public Cloud) or B (handling on BTP)", "Option A, after a workshop with Gareth"],
			["D10", "User management: roles via IdP groups; scope in IAS via SCIM (Option 1) or app table (Option 2)", "Option 2 for the scope, IAS groups for roles"],
			["D11", "Owners for the administration tasks", "HYDAC fills in the table"]
		], { y: TOP, colW: [0.6, 6.2, 5.33], fontSize: 10.5 });
		s.addNotes("D1–D7 unblock the DEV setup; D8–D10 can be taken after the AU workshop and the identity setup.");
	}
	{
		const s = content("Open questions and next steps", "6 Administration and decisions");
		const half = (CW - 0.3) / 2;
		card(s, LM, TOP, half, 5.3);
		await iconCircle(s, "FiHelpCircle", LM + 0.2, TOP + 0.2, 0.5, HX.accent4);
		text(s, "Open questions for HYDAC", LM + 0.85, TOP + 0.22, half - 1.0, 0.45, { fontSize: 15, bold: true, color: C.accent1, valign: "middle" });
		const qs = ["Role of GWQ (hub Gateway for Q4H?) and the production pair of systems", "S/4 release of Q4H (for E-07)", "USA: same S/4 as Europe, or a separate one?", "Australia: scope, sales orgs, Magento AU flow, developer extensibility", "Are sales-org codes unique across all backends?", "Magento ↔ backends: direct or via Integration Suite?", "Corporate IdP (Entra ID?), IAS tenant(s), shared with the AU Public Cloud?", "Data residency and retention for request data, especially AU", "Existing Work Zone site and HANA Cloud instance to reuse?", "Users per role / region / sales org; requests per day"];
		s.addText(qs.map((q, i) => ({ text: q, options: { bullet: { type: "number" }, breakLine: i < qs.length - 1 } })), { x: LM + 0.2, y: TOP + 0.8, w: half - 0.4, h: 4.4, fontSize: 11, color: C.text1, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 4 });
		card(s, LM + half + 0.3, TOP, half, 5.3);
		await iconCircle(s, "FiArrowRight", LM + half + 0.5, TOP + 0.2);
		text(s, "Next steps after the review", LM + half + 1.15, TOP + 0.22, half - 1.3, 0.45, { fontSize: 15, bold: true, color: C.accent1, valign: "middle" });
		const ns = ["HYDAC confirms subaccount, roles, Git and transport setup (D1–D7)", "purplecat deploys phase 1 (mock data) to DEV: first end-to-end check of Work Zone, XSUAA, HANA – and the first click-through for key users", "Decide E-07, start the S/4 service (B-02/B-03) on Q4H/GWQ in parallel with the Cloud Connector setup", "CAP adapter + replica with the backend registry; connection tests on DEV; then principal propagation", "Identity setup: IdP ↔ IAS ↔ BTP, groups for roles; sales-org scope per D10", "Australia workshop (D9), then the AU backend contract"];
		s.addText(ns.map((q, i) => ({ text: q, options: { bullet: { type: "number" }, breakLine: i < ns.length - 1 } })), { x: LM + half + 0.5, y: TOP + 0.8, w: half - 0.7, h: 4.4, fontSize: 11.5, color: C.text1, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 6 });
		s.addNotes("Questions 1–3 and 7 can be answered in the session; the rest by email.");
	}
	{
		const s = pres.addSlide({ masterName: "CLOSING", sectionTitle: "6 Administration and decisions" });
		s.addText("Thank you – discussion", { placeholder: "title" });
		s.addText(lines(["Igor Vorobev · purplecat AG · igor.vorobev@purplecat.io", "", "Pre-read and detail: docs/11_design_review_hydac.md in the project repository", "Specifications: docs/01 business logic · docs/03 service contract · docs/04 screens · docs/10 S/4 interface draft"]), { placeholder: "body" });
	}

	// ============================================================================================ write
	await pres.writeFile({ fileName: OUT });
	if (process.env.PPTX_SKILL) {
		const { applyTheme } = require(path.join(process.env.PPTX_SKILL, "scripts", "apply_theme.js"));
		await applyTheme(OUT, THEME);
	}
	console.log("written", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
