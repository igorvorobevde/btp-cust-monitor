namespace hydac.custmon;

using {
  managed,
  cuid
} from '@sap/cds/common';

type ProcessType : String(6) enum {
  CR_DEB;
  CH_DEB;
  CR_AP;
  CH_AP;
  CR_WE;
};

type StatusCode  : String(3);
type StepCode    : String(10);

type ReleaseProc : String(10) enum {
  NOT_REL;
  AUTOMATIC;
  MANUAL;
};

type StepInput   : String(20) enum {
  NONE;
  CONFIRM;
  BUSINESS_PARTNER;
  TEXT;
};

/** Vorgang aus Magento (ZEC_CUSTOMER) – managed: createdAt/By, modifiedAt/By */
entity Requests : cuid, managed {
  processType          : ProcessType;
  source               : String(10);
  status               : Association to Statuses;
  // Zuordnung (read-only für die UI)
  customer             : String(10);
  businessPartner      : String(10);
  shipToCustomer       : String(10);
  contactPersonNumber  : String(10);
  magentoCompany       : String(10);
  magentoCustomer      : String(10);
  magentoAddress       : String(10);
  // Listen-/Steuerfelder (read-only)
  salesOrganization    : String(4);
  orderExists          : Boolean;
  orderVolume          : Decimal(15, 2);
  currency             : String(5);
  creditCardPayment    : Boolean;
  released             : Boolean;
  releaseProcedure     : ReleaseProc;
  releasedBy           : String(255);
  releasedAt           : Timestamp;
  inClarification      : Boolean;
  clarificationComment : String(100);
  // Hauptdaten (editierbar)
  title                : String(4);
  name                 : String(40);
  name2                : String(40);
  name3                : String(40);
  name4                : String(40);
  street               : String(60);
  houseNumber          : String(10);
  street4              : String(40);
  street5              : String(40);
  postalCode           : String(10);
  city                 : String(40);
  country              : String(3);
  language             : String(2);
  telephone            : String(30);
  email                : String(241);
  vatNumber            : String(20);
  taxNumber2           : String(18);
  searchTerm2          : String(20);
  industrySector       : String(4);
  duns                 : String(11);
  // Kompositionen
  salesData            : Composition of one SalesData
                           on salesData.request = $self;
  admin                : Composition of one ContactPersons
                           on admin.request = $self;
  shipTo               : Composition of one ShipToParties
                           on shipTo.request = $self;
  // Protokoll: Assoziation statt Komposition, damit es keinen Draft-Zustand hat (E-12)
  log                  : Association to many LogEntries
                           on log.request = $self;
  // Codelisten-Navigation (unmanaged → keine neuen Spalten, OData-Namen bleiben) – F-11
  processTypeRef       : Association to ProcessTypes
                           on processTypeRef.code = processType;
  releaseStateRef      : Association to ReleaseStates
                           on releaseStateRef.code = releaseState;
  // berechnet on-read (filter-/sortierbar): Statusgruppe und Kritikalität für Fiori Elements – F-11
  statusGroup          : String(10) = status.group;
  statusCriticality    : Integer    = status.criticality;
  // Zeilen-Highlight: Fehler rot (1), sonst Bestellung blau (5), sonst neutral – F-24
  rowCriticality       : Integer    = case when status.group = 'ERROR' then 1 when orderExists = true then 5 else 0 end;
  // Arbeitsvorrat-Priorität (Standardsortierung): Fehler 1, offen 2, abgelehnt 3, erledigt 4 – F-24
  priority             : Integer    = case when status.group = 'ERROR' then 1 when status.group = 'OPEN' then 2 when status.group = 'REJECTED' then 3 else 4 end;
  releaseCriticality   : Integer    = case when released = true then 3 else 2 end;
  // Wartezeit (F-24): letzte Zustandsänderung (Status, Klärung, Freigabe), gesetzt von den Schrittaktionen;
  // waitingText = relative Zeit dazu, im Service berechnet und lokalisiert
  waitingSince         : Timestamp;
  virtual waitingText  : String(40);
  // empfohlener nächster Schritt (F-24, W-1) und sein lokalisierter Text, im Service aus der Statusmaschine berechnet
  virtual nextStep     : StepCode;
  virtual nextStepText : String(60);
  // berechnet stored (Assoziation releaseStateRef braucht eine Spalte; Neuberechnung bei UPDATE) – F-11
  releaseState         : String(12) = (case when released = true then releaseProcedure else 'NOT_RELEASED' end) stored;
  // berechnet: Status offen (0xx/1xx), freigegeben und Benutzer hat Rolle MonitorEditor
  virtual isEditable   : Boolean;
  // berechnet: !isEditable – steuert die Sichtbarkeit von „Bearbeiten“ (UI.UpdateHidden, E-12)
  virtual editHidden   : Boolean;
  // berechnet: Verfügbarkeit je Schrittaktion (Core.OperationAvailable) aus Customizing, Status, Freigabe, Rollen – E-04
  virtual canRelease                  : Boolean; // RELEASE
  virtual canReject                   : Boolean; // REJECT
  virtual canClarify                  : Boolean; // CLARIFY
  virtual canReset                    : Boolean; // RESET
  virtual canCreateCustomer           : Boolean; // CREATE
  virtual canCreateShipTo             : Boolean; // CREATE_WE
  virtual canModifyContact            : Boolean; // AP_MODIFY
  virtual canConvertToNewCustomer     : Boolean; // CNG_NEW
  virtual canCompleteManually         : Boolean; // MANUAL_OK
  virtual canAssignExistingCustomer   : Boolean; // CHNG_OLD
  virtual canChangeCustomerAssignment : Boolean; // CNG_DEBI
}

/**
 * Kind-Entitäten tragen ein eigenes modifiedAt als ETag (Abweichung zu 03-Entwurf, siehe 03 §3),
 * damit auch PATCH auf Vertriebs-/Admin-/WE-Daten optimistisch gesperrt ist.
 */
aspect ChildETag {
  modifiedAt : Timestamp @cds.on.insert: $now  @cds.on.update: $now;
}

entity SalesData : cuid, ChildETag {
  request             : Association to Requests;
  salesOrganization   : String(4);
  distributionChannel : String(2);
  division            : String(2);
  salesGroup          : String(3);
  salesOffice         : String(4);
  customerGroup       : String(2);
  salesDistrict       : String(6);
  incoterms1          : String(3);
  incoterms2          : String(28);
}

entity ContactPersons : cuid, ChildETag {
  request             : Association to Requests;
  contactPersonNumber : String(10); // read-only
  businessPartner     : String(10); // read-only
  magentoCustomer     : String(10); // read-only
  shopRole            : String(2);
  title               : String(4);
  firstName           : String(40);
  lastName            : String(40);
  function            : String(2);
  department          : String(4);
  language            : String(2);
  telephone           : String(30);
  email               : String(241);
}

entity ShipToParties : cuid, ChildETag {
  request            : Association to Requests;
  shipToCustomer     : String(10); // read-only
  businessPartner    : String(10); // read-only
  magentoAddress     : String(10); // read-only
  addressUsedInOrder : Boolean; // read-only
  name               : String(40);
  name2              : String(40);
  name3              : String(40);
  name4              : String(40);
  street             : String(60);
  houseNumber        : String(10);
  street4            : String(40);
  street5            : String(40);
  postalCode         : String(10);
  city               : String(40);
  country            : String(3);
  vatNumber          : String(20);
}

entity LogEntries {
  key request       : Association to Requests;
  key line          : Integer;
      messageType   : String(1); // S I W E A
      messageClass  : String(20);
      messageNumber : String(3);
      messageText   : String(255); // serverseitig aufgelöst
      step          : StepCode;
      fieldName     : String(30);
      oldValue      : String(255);
      newValue      : String(255);
      createdBy     : String(255);
      createdAt     : Timestamp;
      // Kritikalität je Meldungstyp für die Protokolltabelle (S 3, W 2, E/A 1, I 5) – F-11
      criticality   : Integer = case when messageType = 'S' then 3
                                     when messageType = 'W' then 2
                                     when messageType = 'E' then 1
                                     when messageType = 'A' then 1
                                     when messageType = 'I' then 5
                                     else 0 end;
}

// Customizing (read-only, Texte sprachabhängig)
entity Statuses {
  key code        : StatusCode;
      text        : localized String(60);
      icon        : String(30);
      group       : String(10); // OPEN | ERROR | REJECTED | DONE
      criticality : Integer; // UI.CriticalityType: 0 neutral, 1 negative, 2 critical, 3 positive, 5 information
}

/** Statusgruppen als Codeliste (Filter „Statusgruppe“, Texte sprachabhängig) */
entity StatusGroups {
  key code : String(10); // OPEN | ERROR | REJECTED | DONE
      text : localized String(60);
}

/** Freigabezustand als Codeliste (Kopfanzeige „Freigabe“) */
entity ReleaseStates {
  key code : String(12); // NOT_RELEASED | NOT_REL | AUTOMATIC | MANUAL
      text : localized String(60);
}

entity ProcessTypes {
  key code : ProcessType;
      text : localized String(60);
}

entity Steps {
  key code          : StepCode;
      text          : localized String(60);
      successStatus : StatusCode;
      errorStatus   : StatusCode;
      input         : StepInput;
}

/** ZEC_CUST_PROCESS – nur Mock, nicht exponiert */
entity ProcessSteps {
  key source      : String(10);
  key processType : ProcessType;
  key status      : StatusCode;
  key step        : StepCode;
}

/** ZEC_CUST_APPROV – nur Mock, nicht exponiert */
entity ApprovalRules {
  key processType       : ProcessType;
  key source            : String(10);
  key salesOrganization : String(4);
      limit             : Decimal(15, 2);
      currency          : String(5);
      creditCard        : Boolean;
      notRequired       : Boolean;
}

/** Simulierte S/4-Geschäftspartner für BP-Prüfungen – nur Mock, nicht exponiert */
entity MockBusinessPartners {
  key businessPartner : String(10);
      customer        : String(10);
      hasCustomerRole : Boolean;
      crmNumber       : String(10);
      magentoCompany  : String(10);
}
