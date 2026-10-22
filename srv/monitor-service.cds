using hydac.custmon as db from '../db/schema';

@requires: 'MonitorViewer'
service CustomerMonitorService @(path: '/odata/v4/monitor') {

  // Draft (E-12): Fiori Elements V4 bearbeitet nur Draft-Entitäten; „Bearbeiten“ nur sichtbar, wenn editHidden = false
  @odata.draft.enabled
  @UI.UpdateHidden: editHidden
  @(Capabilities: {
    InsertRestrictions.Insertable: false,
    DeleteRestrictions.Deletable : false
  })
  @restrict: [
    { grant: ['READ', 'availableSteps'], to: 'MonitorViewer' },
    { grant: ['UPDATE', 'executeStep'], to: 'MonitorEditor' }
  ]
  entity Requests       as projection on db.Requests actions {
    function availableSteps() returns array of StepOption;
    action   executeStep(step : db.StepCode,
                         businessPartner : String(10),
                         text : String(100),
                         force : Boolean) returns Requests;
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

  // Wertehilfen mit Distinct-Werten (nur Codes, keine Vorgangsdaten) – F-11
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'MonitorViewer', where: 'salesOrganization = $user.SalesOrg' }]
  entity SalesOrganizations as select from db.Requests distinct { key salesOrganization };

  @readonly
  @cds.redirection.target: false
  entity Sources            as select from db.Requests distinct { key source };

  type StepOption {
    step          : db.StepCode;
    text          : String(60);
    input         : db.StepInput;
    textMaxLength : Integer; // nur bei input = TEXT
    destructive   : Boolean; // REJECT, RESET → UI zeigt Warn-Styling
  }
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
  inClarification      @readonly;
  clarificationComment @readonly;
  statusGroup          @readonly;
  statusCriticality    @readonly;
  orderCriticality     @readonly;
  releaseCriticality   @readonly;
  releaseState         @readonly;
  isEditable           @Core.Computed;
  editHidden           @Core.Computed;
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
