sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Sorter",
	"../util/FilterBuilder"
], function (BaseController, JSONModel, Sorter, FilterBuilder) {
	"use strict";

	return BaseController.extend("hydac.custmon.controller.List", {
		onInit: function () {
			// Filterzustand bleibt erhalten, solange die App läuft (04 §2.1) – die List-View lebt in der FCL weiter
			this.setModel(new JSONModel({
				filter: FilterBuilder.getDefaultState(),
				count: 0,
				salesOrganizations: [],
				sources: []
			}), "view");

			this.getRouter().attachRouteMatched(this._onRouteMatched, this);
			this.getOwnerComponent().getEventBus().subscribe("custmon", "requestChanged", this._onRequestChanged, this);

		},

		onExit: function () {
			// Router wird mit der Komponente zerstört (vor den Views) – nur den EventBus abmelden
			this.getOwnerComponent().getEventBus().unsubscribe("custmon", "requestChanged", this._onRequestChanged, this);
		},

		// ---------- Filter ----------

		onSearch: function () {
			this._applyFilters();
		},

		onResetFilters: function () {
			this.getModel("view").setProperty("/filter", FilterBuilder.getDefaultState());
			this._applyFilters();
		},

		_applyFilters: function () {
			const oState = this.getModel("view").getProperty("/filter");
			this.byId("requestsTable").getBinding("items").filter(FilterBuilder.build(oState));
		},

		/**
		 * Werte für VKORG/Quelle aus den sichtbaren Vorgängen (Service filtert nach Berechtigung).
		 * @private
		 */
		_loadDistinctValues: async function (sProperty, sTargetPath) {
			const oBinding = this.getModel().bindList("/Requests", null, [new Sorter(sProperty)], [], {
				$apply: "groupby((" + sProperty + "))"
			});
			try {
				const aContexts = await oBinding.requestContexts(0, 500);
				const aValues = aContexts
					.map((oContext) => oContext.getProperty(sProperty))
					.filter((v) => !!v)
					.map((v) => ({ key: v }));
				this.getModel("view").setProperty(sTargetPath, aValues);
			} catch {
				// technische Fehler meldet der ErrorHandler
			} finally {
				oBinding.destroy();
			}
		},

		// ---------- Tabelle ----------

		onUpdateFinished: function (oEvent) {
			const iTotal = oEvent.getParameter("total");
			this.getModel("view").setProperty("/count", iTotal || 0);
			this._selectCurrentRequest();
		},

		onRefresh: function () {
			this.byId("requestsTable").getBinding("items").refresh();
		},

		onOpenSortDialog: async function () {
			this._pSortDialog ??= this.loadFragment({ name: "hydac.custmon.view.fragments.SortDialog" });
			(await this._pSortDialog).open();
		},

		onSortConfirm: function (oEvent) {
			const oItem = oEvent.getParameter("sortItem");
			const bDescending = oEvent.getParameter("sortDescending");
			this.byId("requestsTable").getBinding("items").sort(new Sorter(oItem.getKey(), bDescending));
		},

		onSelectionChange: async function (oEvent) {
			const oItem = oEvent.getParameter("listItem");
			const sId = oItem.getBindingContext().getProperty("ID");
			if (sId === this._sCurrentId) {
				return;
			}
			if (!(await this.confirmDiscardChanges())) {
				this._selectCurrentRequest();
				return;
			}
			this.navTo("detail", { id: sId });
		},

		_onRouteMatched: function (oEvent) {
			this._initialLoad();
			const sRoute = oEvent.getParameter("name");
			this._sCurrentId = sRoute === "list" ? null : oEvent.getParameter("arguments").id;
			this._selectCurrentRequest();
		},

		/**
		 * Erstes Laden erst nach dem ersten Routing: in onInit erbt die View das OData-Model der Komponente
		 * noch nicht, die Items-Binding der Tabelle existiert dann noch nicht.
		 * @private
		 */
		_initialLoad: function () {
			if (this._bInitialized) {
				return;
			}
			this._bInitialized = true;
			this._loadDistinctValues("salesOrganization", "/salesOrganizations");
			this._loadDistinctValues("source", "/sources");
			this._applyFilters();
			this.byId("requestsTable").getBinding("items").resume();
		},

		/** Markiert die im Detail geöffnete Zeile (auch nach Deep-Link und Nachladen). */
		_selectCurrentRequest: function () {
			const oTable = this.byId("requestsTable");
			if (!this._sCurrentId) {
				oTable.removeSelections(true);
				return;
			}
			const oItem = oTable.getItems().find((oListItem) => {
				const oContext = oListItem.getBindingContext();
				return oContext && oContext.getProperty("ID") === this._sCurrentId;
			});
			if (oItem) {
				oTable.setSelectedItem(oItem, true);
			} else {
				oTable.removeSelections(true);
			}
		},

		_onRequestChanged: function () {
			this.byId("requestsTable").getBinding("items").refresh();
		}
	});
});
