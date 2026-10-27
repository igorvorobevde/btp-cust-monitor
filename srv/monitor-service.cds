using hydac.custmon as db from '../db/schema';

@requires: 'MonitorViewer'
service CustomerMonitorService @(path: '/odata/v4/monitor') {

  // Draft (E-12): Fiori Elements V4 bearbeitet nur Draft-Entitäten; „Bearbeiten“ nur sichtbar, wenn editHidden = false
  @odata.draft.enabled
  @UI.UpdateHidden: editHidden
  @(Capabilities: {
    InsertRestrictions.Insertable: false,
    DeleteRestrictions.Deletable : false,
    SortRestrictions.NonSortableProperties: [waitingText, nextStep, nextStepText],
    FilterRestrictions.NonFilterableProperties: [waitingText, nextStep, nextStepText]
  })
  @restrict: [
    { grant: 'READ', to: 'MonitorViewer' },
    { grant: ['UPDATE', // deckt auch draftEdit (EDIT) ab
              'release', 'rejectRequest', 'clarify', 'reset', 'createCustomer', 'createShipTo',
              'modifyContact', 'convertToNewCustomer', 'completeManually',
              'assignExistingCustomer', 'changeCustomerAssignment'], to: 'MonitorEditor' }
  ]
  entity Requests       as projection on db.Requests actions {
    // Eine gebundene Aktion je Schritt (E-04). Verfügbarkeit über can*-Flags (Core.OperationAvailable),
    // Bestätigung parameterloser Aktionen über Common.IsActionCritical, Rückfragen per Strict Handling (03 §5.3).

    /** RELEASE – Freigeben (nur MonitorReleaser, siehe canRelease) */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canRelease )
    action release(in : $self) returns Requests;

    /** REJECT – Anfrage ablehnen (Begründung Pflicht, max. 100 Zeichen) */
    @Core.OperationAvailable: ( :in.canReject )
    action rejectRequest(in : $self,
                         @mandatory @title: '{i18n>param.reason}' @UI.MultiLineText
                         reason : String(100)) returns Requests;

    /** CLARIFY – In Klärung setzen (Kommentar Pflicht, max. 100 Zeichen) */
    @Core.OperationAvailable: ( :in.canClarify )
    action clarify(in : $self,
                   @mandatory @title: '{i18n>param.comment}' @UI.MultiLineText
                   comment : String(100)) returns Requests;

    /** RESET – Erneut bearbeiten */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canReset )
    action reset(in : $self) returns Requests;

    /** CREATE – Debitor und Admin anlegen */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canCreateCustomer )
    action createCustomer(in : $self) returns Requests;

    /** CREATE_WE – Warenempfänger anlegen */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canCreateShipTo )
    action createShipTo(in : $self) returns Requests;

    /** AP_MODIFY – Ansprechpartner anlegen/ändern */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canModifyContact )
    action modifyContact(in : $self) returns Requests;

    /** CNG_NEW – In Neukunde umwandeln */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canConvertToNewCustomer )
    action convertToNewCustomer(in : $self) returns Requests;

    /** MANUAL_OK – Manuell erledigen */
    @Common.IsActionCritical
    @Core.OperationAvailable: ( :in.canCompleteManually )
    action completeManually(in : $self) returns Requests;

    /** CHNG_OLD – Dublette: bestehenden Debitor zuordnen (Rückfrage bei fremder Magento-Company) */
    @Core.OperationAvailable: ( :in.canAssignExistingCustomer )
    action assignExistingCustomer(in : $self,
                                  @mandatory @title: '{i18n>param.businessPartner}'
                                  businessPartner : String(10)) returns Requests;

    /** CNG_DEBI – Zuordnung zu Debitor ändern (Rückfrage bei fremder Magento-Company) */
    @Core.OperationAvailable: ( :in.canChangeCustomerAssignment )
    action changeCustomerAssignment(in : $self,
                                    @mandatory @title: '{i18n>param.businessPartner}'
                                    businessPartner : String(10)) returns Requests;
  };

  @(Capabilities: {
    InsertRestrictions.Insertable: false,
    DeleteRestrictions.Deletable : false
  })
  @restrict: [
    { grant: 'READ', to: 'MonitorViewer' },
    { grant: 'UPDATE', to: 'MonitorEditor' }
  ]
  entity SalesData      as projection on db.SalesData;

  @(Capabilities: {
    InsertRestrictions.Insertable: false,
    DeleteRestrictions.Deletable : false
  })
  @restrict: [
    { grant: 'READ', to: 'MonitorViewer' },
    { grant: 'UPDATE', to: 'MonitorEditor' }
  ]
  entity ContactPersons as projection on db.ContactPersons;

  @(Capabilities: {
    InsertRestrictions.Insertable: false,
    DeleteRestrictions.Deletable : false
  })
  @restrict: [
    { grant: 'READ', to: 'MonitorViewer' },
    { grant: 'UPDATE', to: 'MonitorEditor' }
  ]
  entity ShipToParties  as projection on db.ShipToParties;

  @readonly
  entity LogEntries     as projection on db.LogEntries;

  @readonly
  entity Statuses       as projection on db.Statuses;

  @readonly
  entity ProcessTypes   as projection on db.ProcessTypes;

  @readonly
  entity Steps          as projection on db.Steps;

  @readonly
  entity StatusGroups   as projection on db.StatusGroups;

  @readonly
  entity ReleaseStates  as projection on db.ReleaseStates;

  @readonly
  entity ReleaseReasons as projection on db.ReleaseReasons;

  // Wertehilfe Geschäftspartner für CHNG_OLD/CNG_DEBI (B-05); Phase 1 aus den Mock-BPs, Phase 2 aus S/4 (Replik oder Remote)
  @readonly
  @cds.search: { businessPartner, name, customer }
  entity BusinessPartners as projection on db.MockBusinessPartners {
    key businessPartner, name, customer, hasCustomerRole, magentoCompany
  };

  // Wertehilfen mit Distinct-Werten (nur Codes, keine Vorgangsdaten) – F-11
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'MonitorViewer', where: 'salesOrganization = $user.SalesOrg' }]
  entity SalesOrganizations as select from db.Requests distinct { key salesOrganization };

  @readonly
  @cds.redirection.target: false
  entity Sources            as select from db.Requests distinct { key source };
}

// Side Effects: nach jeder Schrittaktion lädt Fiori Elements Status/Flags/Zuordnung des Vorgangs sowie Protokoll und Kinder neu.
// (Identischer Block je Aktion – CDS kennt keine Wiederverwendung von Annotationswerten.)
annotate CustomerMonitorService.Requests with actions {
  release                  @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  rejectRequest            @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  clarify                  @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  reset                    @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  createCustomer           @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  createShipTo             @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  modifyContact            @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  convertToNewCustomer     @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  completeManually         @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  assignExistingCustomer   @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
  changeCustomerAssignment @Common.SideEffects: { TargetProperties: ['in/status_code', 'in/statusGroup', 'in/statusCriticality', 'in/processType', 'in/released', 'in/releaseState', 'in/releaseCriticality', 'in/releasedBy', 'in/releasedAt', 'in/inClarification', 'in/clarificationComment', 'in/customer', 'in/businessPartner', 'in/shipToCustomer', 'in/contactPersonNumber', 'in/modifiedAt', 'in/modifiedBy', 'in/waitingSince', 'in/waitingText', 'in/nextStep', 'in/nextStepText', 'in/priority', 'in/rowCriticality', 'in/releaseReason', 'in/releaseLimit', 'in/isEditable', 'in/editHidden', 'in/canRelease', 'in/canReject', 'in/canClarify', 'in/canReset', 'in/canCreateCustomer', 'in/canCreateShipTo', 'in/canModifyContact', 'in/canConvertToNewCustomer', 'in/canCompleteManually', 'in/canAssignExistingCustomer', 'in/canChangeCustomerAssignment'], TargetEntities: ['in/log', 'in/admin', 'in/shipTo', 'in/salesData'] };
}

// ETag
annotate CustomerMonitorService.Requests with {
  modifiedAt @odata.etag;
};

annotate CustomerMonitorService.SalesData with {
  modifiedAt @odata.etag;
};

annotate CustomerMonitorService.ContactPersons with {
  modifiedAt @odata.etag;
};

annotate CustomerMonitorService.ShipToParties with {
  modifiedAt @odata.etag;
};

// Read-only-Felder (Zuordnung, Steuerfelder, berechnete Felder)
annotate CustomerMonitorService.Requests with {
  processType          @readonly;
  source               @readonly;
  status               @readonly;
  customer             @readonly;
  businessPartner      @readonly;
  shipToCustomer       @readonly;
  contactPersonNumber  @readonly;
  magentoCompany       @readonly;
  magentoCustomer      @readonly;
  magentoAddress       @readonly;
  salesOrganization    @readonly;
  orderExists          @readonly;
  orderVolume          @readonly  @Measures.ISOCurrency: currency;
  currency             @readonly;
  creditCardPayment    @readonly;
  released             @readonly;
  releaseProcedure     @readonly;
  releasedBy           @readonly;
  releasedAt           @readonly;
  releaseReason        @readonly;
  releaseLimit         @readonly  @Measures.ISOCurrency: currency;
  inClarification      @readonly;
  clarificationComment @readonly;
  statusGroup          @readonly;
  statusCriticality    @readonly;
  rowCriticality       @readonly;
  priority             @readonly;
  releaseCriticality   @readonly;
  waitingSince         @readonly;
  waitingText          @Core.Computed;
  nextStep             @Core.Computed;
  nextStepText         @Core.Computed;
  releaseState         @readonly;
  isEditable           @Core.Computed;
  editHidden           @Core.Computed;
  canRelease                  @Core.Computed;
  canReject                   @Core.Computed;
  canClarify                  @Core.Computed;
  canReset                    @Core.Computed;
  canCreateCustomer           @Core.Computed;
  canCreateShipTo             @Core.Computed;
  canModifyContact            @Core.Computed;
  canConvertToNewCustomer     @Core.Computed;
  canCompleteManually         @Core.Computed;
  canAssignExistingCustomer   @Core.Computed;
  canChangeCustomerAssignment @Core.Computed;
  email                @Communication.IsEmailAddress;
};

annotate CustomerMonitorService.SalesData with {
  request           @readonly;
  salesOrganization @readonly;
  modifiedAt        @Core.Computed;
};

annotate CustomerMonitorService.ContactPersons with {
  request             @readonly;
  contactPersonNumber @readonly;
  businessPartner     @readonly;
  magentoCustomer     @readonly;
  modifiedAt          @Core.Computed;
  email               @Communication.IsEmailAddress;
};

annotate CustomerMonitorService.ShipToParties with {
  request            @readonly;
  shipToCustomer     @readonly;
  businessPartner    @readonly;
  magentoAddress     @readonly;
  addressUsedInOrder @readonly;
  modifiedAt         @Core.Computed;
};
