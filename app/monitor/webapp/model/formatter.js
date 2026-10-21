sap.ui.define([
	"sap/base/strings/formatMessage"
], function (formatMessage) {
	"use strict";

	// 04 §5 – Gruppe kommt vom Service, die UI mappt nur auf ValueState/Icon
	const STATUS_GROUPS = {
		OPEN: { state: "Information", icon: "sap-icon://pending" },
		ERROR: { state: "Error", icon: "sap-icon://error" },
		REJECTED: { state: "None", icon: "sap-icon://decline" },
		DONE: { state: "Success", icon: "sap-icon://complete" }
	};

	const LOG_TYPES = {
		S: { color: "Positive", icon: "sap-icon://message-success" },
		I: { color: "Default", icon: "sap-icon://message-information" },
		W: { color: "Critical", icon: "sap-icon://message-warning" },
		E: { color: "Negative", icon: "sap-icon://message-error" },
		A: { color: "Negative", icon: "sap-icon://message-error" }
	};

	return {
		/** Platzhalter-Ersetzung für i18n-Texte in Bindings ({0}, {1} …) */
		formatMessage: formatMessage,

		/**
		 * @param {string} sGroup Statusgruppe (OPEN|ERROR|REJECTED|DONE)
		 * @returns {string} sap.ui.core.ValueState
		 */
		statusState: function (sGroup) {
			return (STATUS_GROUPS[sGroup] || {}).state || "None";
		},

		/**
		 * @param {string} sGroup Statusgruppe
		 * @returns {string} Icon-URI
		 */
		statusIcon: function (sGroup) {
			return (STATUS_GROUPS[sGroup] || {}).icon || "";
		},

		/**
		 * @param {string} sCode Statuscode
		 * @param {Object<string,{text: string, group: string}>} mStatuses Code → Text/Gruppe (vom Service)
		 * @returns {string} Statustext (Fallback: Code)
		 */
		statusText: function (sCode, mStatuses) {
			return ((mStatuses && mStatuses[sCode]) || {}).text || sCode || "";
		},

		/**
		 * @param {string} sCode Statuscode
		 * @param {Object<string,{text: string, group: string}>} mStatuses
		 * @returns {string} Statusgruppe oder ""
		 */
		statusGroup: function (sCode, mStatuses) {
			return ((mStatuses && mStatuses[sCode]) || {}).group || "";
		},

		/**
		 * @param {string} sCode Prozessart-Code
		 * @param {Object<string,string>} mTexts Code → Text (vom Service)
		 * @returns {string}
		 */
		processTypeText: function (sCode, mTexts) {
			return (mTexts && mTexts[sCode]) || sCode || "";
		},

		/**
		 * Freigabetext aus Kennzeichen + Verfahren; Texte werden als Binding-Parts übergeben.
		 * @returns {string}
		 */
		releaseText: function (bReleased, sProcedure, sAutomatic, sManual, sNotRequired, sNotReleased) {
			if (!bReleased) {
				return sNotReleased;
			}
			return { AUTOMATIC: sAutomatic, MANUAL: sManual, NOT_REL: sNotRequired }[sProcedure] || sNotRequired;
		},

		/**
		 * @param {boolean} bReleased
		 * @returns {string} ValueState
		 */
		releaseState: function (bReleased) {
			return bReleased ? "Success" : "Warning";
		},

		/**
		 * @param {boolean} bOrderExists
		 * @returns {string} Zeilen-Highlight (Ersatz der farbigen Zeile im Altsystem)
		 */
		rowHighlight: function (bOrderExists) {
			return bOrderExists ? "Information" : "None";
		},

		/**
		 * @param {string} sType Meldungstyp S|I|W|E|A
		 * @returns {string} Icon-URI
		 */
		logTypeIcon: function (sType) {
			return (LOG_TYPES[sType] || LOG_TYPES.I).icon;
		},

		/**
		 * @param {string} sType Meldungstyp S|I|W|E|A
		 * @returns {string} sap.ui.core.IconColor
		 */
		logTypeColor: function (sType) {
			return (LOG_TYPES[sType] || LOG_TYPES.I).color;
		}
	};
});
