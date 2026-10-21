sap.ui.define([
	"sap/ui/core/Messaging"
], function (Messaging) {
	"use strict";

	const NAMESPACE = "CustomerMonitorService";

	function technicalStatus(oMessage) {
		const oDetails = oMessage.getTechnicalDetails && oMessage.getTechnicalDetails();
		return oDetails && oDetails.httpStatus;
	}

	/**
	 * Schrittausführung gegen den CAP-Service (03 §4–5, 05 §5).
	 * Fehler werden ausschließlich hier ausgewertet; Controller erhalten ein normalisiertes Ergebnis.
	 */
	const StepService = {
		/**
		 * Normalisiert einen Fehler aus ODataContextBinding#invoke.
		 * @param {Error & {status?: number, error?: {code?: string, message?: string}}} oError
		 * @returns {{outcome: "confirm"|"conflict"|"error", message: string, code: string|undefined, status: number|undefined}}
		 */
		mapError: function (oError) {
			const iStatus = oError && oError.status;
			const oBody = (oError && oError.error) || {};
			const sCode = oBody.code;
			const sMessage = oBody.message || (oError && oError.message) || "";
			if (iStatus === 412) {
				return { outcome: "conflict", message: sMessage, code: sCode, status: iStatus };
			}
			if (iStatus === 409 && sCode === "CONFIRM_REQUIRED") {
				return { outcome: "confirm", message: sMessage, code: sCode, status: iStatus };
			}
			return { outcome: "error", message: sMessage, code: sCode, status: iStatus };
		},

		/**
		 * Lädt die erlaubten Schritte (bei jedem Öffnen des Menüs neu).
		 * @param {sap.ui.model.odata.v4.Context} oRequestContext
		 * @returns {Promise<Array<{step: string, text: string, input: string, textMaxLength: number, destructive: boolean}>>}
		 */
		getAvailableSteps: async function (oRequestContext) {
			const oOperation = oRequestContext.getModel()
				.bindContext(NAMESPACE + ".availableSteps(...)", oRequestContext);
			try {
				await oOperation.invoke();
				return oOperation.getBoundContext().getObject().value || [];
			} finally {
				oOperation.destroy();
			}
		},

		/**
		 * Führt einen Schritt aus; sendet If-Match aus dem ETag des Kontexts.
		 * @param {sap.ui.model.odata.v4.Context} oRequestContext
		 * @param {{step: string, businessPartner?: string, text?: string, force?: boolean}} mParams
		 * @returns {Promise<{outcome: "ok"|"confirm"|"conflict"|"error", message?: string, code?: string,
		 *   status?: number, statusCode?: string, messages: Array<{type: string, message: string}>}>}
		 */
		executeStep: async function (oRequestContext, mParams) {
			const oOperation = oRequestContext.getModel()
				.bindContext(NAMESPACE + ".executeStep(...)", oRequestContext);
			oOperation.setParameter("step", mParams.step)
				.setParameter("businessPartner", mParams.businessPartner || null)
				.setParameter("text", mParams.text || null)
				.setParameter("force", !!mParams.force);

			const aBefore = new Set(Messaging.getMessageModel().getData());
			const collectNewMessages = () => Messaging.getMessageModel().getData()
				.filter((oMessage) => !aBefore.has(oMessage));
			try {
				await oOperation.invoke();
				const oResult = oOperation.getBoundContext().getObject() || {};
				return {
					outcome: "ok",
					statusCode: oResult.status_code,
					messages: collectNewMessages().map((m) => ({ type: m.getType(), message: m.getMessage() }))
				};
			} catch (oError) {
				const oMapped = StepService.mapError(oError);
				const aNew = collectNewMessages();
				if (oMapped.outcome === "confirm" || oMapped.outcome === "conflict") {
					// Rückfrage/Konflikt behandelt der Dialog – nicht zusätzlich im MessagePopover anzeigen
					Messaging.removeMessages(aNew.filter((m) => [409, 412].includes(technicalStatus(m))));
				}
				oMapped.messages = aNew.map((m) => ({ type: m.getType(), message: m.getMessage() }));
				return oMapped;
			} finally {
				oOperation.destroy();
			}
		}
	};

	return StepService;
});
