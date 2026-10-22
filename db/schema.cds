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
  log                  : Composition of many LogEntries
                           on log.request = $self;
  // berechnet: Status offen (0xx/1xx), freigegeben und Benutzer hat Rolle MonitorEditor
  virtual isEditable   : Boolean;
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
