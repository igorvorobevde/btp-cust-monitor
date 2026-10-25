"use strict";

/**
 * Relative Wartezeit seit der letzten Zustandsänderung (F-24, docs/03 §8).
 * Rein funktional: Texte kommen über den Callback in der Sprache des Requests.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * @param {string|null} sinceIso Zeitpunkt der letzten Zustandsänderung
 * @param {number} nowMs aktueller Zeitpunkt (ms)
 * @param {(key: string, args?: Array) => string} text Textauflösung (messages*.properties)
 * @returns {string|null} null bei fehlendem oder ungültigem Zeitpunkt; Zukunft gilt als "gerade eben"
 */
function waitingText(sinceIso, nowMs, text) {
	const since = sinceIso ? Date.parse(sinceIso) : NaN;
	if (Number.isNaN(since)) {
		return null;
	}
	const elapsed = Math.max(0, nowMs - since);
	if (elapsed < MINUTE) {
		return text("WAITING_NOW");
	}
	if (elapsed < HOUR) {
		return text("WAITING_MINUTES", [Math.floor(elapsed / MINUTE)]);
	}
	if (elapsed < DAY) {
		return text("WAITING_HOURS", [Math.floor(elapsed / HOUR)]);
	}
	const days = Math.floor(elapsed / DAY);
	return days === 1 ? text("WAITING_DAY") : text("WAITING_DAYS", [days]);
}

module.exports = { waitingText };
