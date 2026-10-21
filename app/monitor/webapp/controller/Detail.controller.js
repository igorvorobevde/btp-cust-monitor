sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Messaging",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/MessagePopover",
	"sap/m/MessageItem",
	"../service/StepService"
], function (BaseController, JSONModel, Messaging, MessageBox, MessageToast, MessagePopover, MessageItem, StepService) {
	"use strict";

	const UPDATE_GROUP = "changes";
	const BP_PATTERN = /^\d{1,10}$/;

	return BaseController.extend("hydac.custmon.controller.Detail", {
		onInit: function () {
			this.setModel(new JSONModel({
				editMode: false,
				busy: false,
				hasPendingChanges: false,
				steps: [],
				stepDialog: {}
			}), "view");

			const oRouter = this.getRouter();
			oRouter.getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
			oRouter.getRoute("detailFull").attachPatternMatched(this._onRouteMatched, this);
			this.getOwnerComponent().getModel().attachPropertyChange(this._updatePendingChanges, this);

			this._oMessagePopover = new MessagePopover({
				items: {
					path: "message>/",
					template: new MessageItem({
						type: "{message>type}",
						title: "{message>message}",
						subtitle: "{message>additionalText}",
						description: "{message>description}"
					})
				}
			});
			this.getView().addDependent(this._oMessagePopover);
		},

		onExit: function () {
			// Router und Model werden mit der Komponente zerstört; nur abmelden, solange das Model noch existiert
			const oModel = this.getOwnerComponent().getModel();
			if (oModel) {
				oModel.detachPropertyChange(this._updatePendingChanges, this);
			}
		},

		// ---------- Navigation / Binding ----------

		_onRouteMatched: function (oEvent) {
			const sId = oEvent.getParameter("arguments").id;
			const oModel = this.getModel();
			// z. B. Browser-Zurück mit offenen Änderungen: nichts unbemerkt nachsenden
			if (oModel.hasPendingChanges(UPDATE_GROUP)) {
				oModel.resetChanges(UPDATE_GROUP);
			}
			this._setEditMode(false);
			const sPath = "/Requests(" + encodeURIComponent(sId) + ")";
			const oBinding = this.getView().getElementBinding();
			if (oBinding && oBinding.getPath() === sPath) {
				return;
			}
			this.getView().bindElement({
				path: sPath,
				parameters: {
					$$updateGroupId: UPDATE_GROUP
				},
				events: {
					dataReceived: this._onDataReceived.bind(this)
				}
			});
			this.byId("objectPage").setSelectedSection(this.byId("sectionMain"));
		},

		_onDataReceived: function (oEvent) {
			const oError = oEvent.getParameter("error");
			if (oError && oError.status === 404) {
				MessageBox.error(this.getText("detail.notFound"), {
					onClose: () => this.navTo("list", {}, true)
				});
			}
		},

		onToggleFullScreen: function () {
			const bFull = this.getModel("appView").getProperty("/layout") === "MidColumnFullScreen";
			const sId = this._getContext().getProperty("ID");
			this.navTo(bFull ? "detail" : "detailFull", { id: sId });
		},

		onClose: async function () {
			if (await this.confirmDiscardChanges()) {
				this._setEditMode(false);
				this.navTo("list");
			}
		},

		onRefresh: async function () {
			if (await this.confirmDiscardChanges()) {
				this._setEditMode(false);
				this.getView().getElementBinding().refresh();
			}
		},

		// ---------- Bearbeiten und Sichern (04 §4.1) ----------

		onEdit: function () {
			this._setEditMode(true);
		},

		onSave: async function () {
			const oModel = this.getModel();
			if (!oModel.hasPendingChanges(UPDATE_GROUP)) {
				this._setEditMode(false);
				return;
			}
			const oBefore = new Set(Messaging.getMessageModel().getData());
			this._setBusy(true);
			try {
				await oModel.submitBatch(UPDATE_GROUP);
			} catch {
				// Batch technisch fehlgeschlagen – Meldung kommt über ErrorHandler
			} finally {
				this._setBusy(false);
			}
			const aNew = Messaging.getMessageModel().getData().filter((m) => !oBefore.has(m));

			// R-13: Erfolgsmeldung nur, wenn wirklich alles gesichert wurde
			if (oModel.hasPendingChanges(UPDATE_GROUP)) {
				const aConflicts = aNew.filter((m) => this._httpStatus(m) === 412);
				if (aConflicts.length) {
					Messaging.removeMessages(aConflicts);
					this._handleConflict();
				} else {
					this._oMessagePopover.openBy(this.byId("messagePopoverButton"));
				}
				return;
			}
			MessageToast.show(this.getText("msg.saved"));
			this._setEditMode(false);
			this._refreshAfterChange();
		},

		onCancel: async function () {
			if (await this.confirmDiscardChanges()) {
				this._setEditMode(false);
			}
		},

		_handleConflict: function () {
			MessageBox.warning(this.getText("msg.conflict412"), {
				onClose: () => {
					this.getModel().resetChanges(UPDATE_GROUP);
					this._setEditMode(false);
					this._refreshAfterChange();
				}
			});
		},

		// ---------- Schritt ausführen (04 §4.2) ----------

		onOpenStepMenu: async function (oEvent) {
			const oButton = oEvent.getSource();
			const oContext = this._getContext();
			if (!oContext) {
				return;
			}
			let aSteps;
			oButton.setBusyIndicatorDelay(0).setBusy(true);
			try {
				aSteps = await StepService.getAvailableSteps(oContext);
			} catch (oError) {
				MessageBox.error(this.getText("msg.stepsNotLoaded"), { details: oError.message });
				return;
			} finally {
				oButton.setBusy(false);
			}
			const iFirstDestructive = aSteps.findIndex((s) => s.destructive);
			const aItems = aSteps.map((s, i) => Object.assign({}, s, { startsSection: i > 0 && i === iFirstDestructive }));
			if (!aItems.length) {
				aItems.push({ step: "", text: this.getText("detail.step.none"), destructive: false, startsSection: false });
			}
			this.getModel("view").setProperty("/steps", aItems);

			this._pStepMenu ??= this.loadFragment({ name: "hydac.custmon.view.fragments.StepMenu" });
			(await this._pStepMenu).openBy(oButton);
		},

		onStepSelected: function (oEvent) {
			const sStep = oEvent.getParameter("item").getKey();
			const oOption = this.getModel("view").getProperty("/steps").find((s) => s.step === sStep);
			if (oOption && oOption.step) {
				this._runStep(oOption);
			}
		},

		_runStep: async function (oOption) {
			const mParams = { step: oOption.step };
			if (oOption.input === "CONFIRM") {
				if (!(await this._confirmStep(oOption))) {
					return;
				}
			} else if (oOption.input === "TEXT") {
				const sText = await this._openStepDialog(oOption, "TEXT");
				if (sText === null) {
					return;
				}
				mParams.text = sText;
			} else if (oOption.input === "BUSINESS_PARTNER") {
				const sBp = await this._openStepDialog(oOption, "BUSINESS_PARTNER");
				if (sBp === null) {
					return;
				}
				mParams.businessPartner = sBp;
			}
			await this._executeStep(oOption, mParams);
		},

		_executeStep: async function (oOption, mParams) {
			this._setBusy(true);
			const oResult = await StepService.executeStep(this._getContext(), mParams);
			this._setBusy(false);

			switch (oResult.outcome) {
				case "ok":
					await this._refreshAfterChange();
					this._showStepResult(oOption, oResult);
					break;
				case "confirm":
					MessageBox.confirm(oResult.message, {
						title: oOption.text,
						onClose: (sAction) => {
							if (sAction === MessageBox.Action.OK) {
								this._executeStep(oOption, Object.assign({}, mParams, { force: true }));
							}
						}
					});
					break;
				case "conflict":
					this._handleConflict();
					break;
				default:
					// Abbrüche (STEP_ABORTED) schreiben ins Protokoll → neu laden
					this._refreshAfterChange();
					MessageBox.error(oResult.message || this.getText("msg.stepFailed"), { title: oOption.text });
			}
		},

		_showStepResult: function (oOption, oResult) {
			const sCode = this._getContext().getProperty("status_code");
			const mStatuses = this.getModel("appView").getProperty("/statuses");
			const sGroup = this.formatter.statusGroup(sCode, mStatuses);
			const sStatusText = this.formatter.statusText(sCode, mStatuses);
			if (sGroup === "ERROR") {
				MessageBox.warning(oResult.messages.map((m) => m.message).join("\n") || sStatusText, {
					title: this.getText("msg.stepErrorStatus", [oOption.text, sStatusText])
				});
			} else {
				MessageToast.show(this.getText("msg.stepDone", [oOption.text, sStatusText]));
			}
		},

		_confirmStep: function (oOption) {
			return new Promise((resolve) => {
				const fnShow = oOption.destructive ? MessageBox.warning : MessageBox.confirm;
				fnShow(this.getText("step.confirm.text", [oOption.text]), {
					title: oOption.text,
					actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
					emphasizedAction: oOption.destructive ? MessageBox.Action.CANCEL : MessageBox.Action.OK,
					onClose: (sAction) => resolve(sAction === MessageBox.Action.OK)
				});
			});
		},

		/**
		 * Öffnet den Eingabedialog je Eingabeart; liefert Eingabe oder null bei Abbruch.
		 * @private
		 */
		_openStepDialog: async function (oOption, sKind) {
			this.getModel("view").setProperty("/stepDialog", {
				kind: sKind,
				title: oOption.text,
				destructive: !!oOption.destructive,
				maxLength: oOption.textMaxLength || 100,
				text: "",
				businessPartner: "",
				valid: false,
				valueState: "None"
			});
			this._mStepDialogs ??= {};
			this._mStepDialogs[sKind] ??= this.loadFragment({
				name: sKind === "TEXT"
					? "hydac.custmon.view.fragments.StepTextDialog"
					: "hydac.custmon.view.fragments.StepBusinessPartnerDialog"
			});
			const oDialog = await this._mStepDialogs[sKind];
			return new Promise((resolve) => {
				this._oStepDialog = oDialog;
				this._fnStepDialogResolve = resolve;
				oDialog.open();
			});
		},

		onStepInputChange: function (oEvent) {
			const oModel = this.getModel("view");
			const sValue = oEvent.getParameter("value") || "";
			const oDialog = oModel.getProperty("/stepDialog");
			let bValid;
			let bError;
			if (oDialog.kind === "TEXT") {
				bValid = sValue.trim().length > 0 && sValue.length <= oDialog.maxLength;
				bError = sValue.length > oDialog.maxLength;
			} else {
				bValid = BP_PATTERN.test(sValue);
				bError = !/^\d*$/.test(sValue);
			}
			oModel.setProperty("/stepDialog/valid", bValid);
			oModel.setProperty("/stepDialog/valueState", bError ? "Error" : "None");
		},

		onStepDialogConfirm: function () {
			const oDialog = this.getModel("view").getProperty("/stepDialog");
			if (!oDialog.valid) {
				return;
			}
			const sValue = oDialog.kind === "TEXT" ? oDialog.text.trim() : oDialog.businessPartner;
			this._resolveStepDialog(sValue);
		},

		onStepDialogCancel: function () {
			this._resolveStepDialog(null);
		},

		onStepDialogAfterClose: function () {
			this._resolveStepDialog(null);
		},

		_resolveStepDialog: function (vValue) {
			const fnResolve = this._fnStepDialogResolve;
			this._fnStepDialogResolve = null;
			if (this._oStepDialog && this._oStepDialog.isOpen()) {
				this._oStepDialog.close();
			}
			if (fnResolve) {
				fnResolve(vValue);
			}
		},

		// ---------- Meldungen (04 §4.3) ----------

		onOpenMessagePopover: function (oEvent) {
			this._oMessagePopover.toggle(oEvent.getSource());
		},

		formatMessageButtonType: function (aMessages) {
			const aTypes = (aMessages || []).map((m) => m.getType());
			if (aTypes.includes("Error")) {
				return "Negative";
			}
			if (aTypes.includes("Warning")) {
				return "Critical";
			}
			if (aTypes.includes("Success")) {
				return "Success";
			}
			return "Neutral";
		},

		formatSubtitle: function (sProcessType, mTexts, sMagentoCompany) {
			const sType = this.formatter.processTypeText(sProcessType, mTexts);
			return [sType, sMagentoCompany].filter((s) => !!s).join(" · ");
		},

		// ---------- Hilfsfunktionen ----------

		_getContext: function () {
			return this.getView().getBindingContext();
		},

		_httpStatus: function (oMessage) {
			const oDetails = oMessage.getTechnicalDetails && oMessage.getTechnicalDetails();
			return oDetails && oDetails.httpStatus;
		},

		/** Detail (inkl. Protokoll) neu laden und Liste informieren. */
		_refreshAfterChange: async function () {
			this.getOwnerComponent().getEventBus().publish("custmon", "requestChanged");
			try {
				await this.getView().getElementBinding().requestRefresh();
			} catch {
				// technische Fehler meldet der ErrorHandler
			}
		},

		_setEditMode: function (bEdit) {
			this.getModel("view").setProperty("/editMode", bEdit);
			this._updatePendingChanges();
		},

		_setBusy: function (bBusy) {
			this.getModel("view").setProperty("/busy", bBusy);
		},

		_updatePendingChanges: function () {
			this.getModel("view").setProperty("/hasPendingChanges", this.getModel().hasPendingChanges(UPDATE_GROUP));
		}
	});
});
