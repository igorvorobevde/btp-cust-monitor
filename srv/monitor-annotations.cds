/**
 * Vertrags-Semantik für Fiori Elements (E-13): Labels, Texte, Wertehilfen, Kritikalität, Suche.
 * Layout (SelectionFields, LineItem, Facets, Aktionsgruppe) liegt in app/monitor/annotations.cds.
 * Labels: _i18n/i18n.properties (EN) und _i18n/i18n_de.properties.
 */
using CustomerMonitorService as S from './monitor-service';

// Volltextsuche der Liste (FE sendet $search)
annotate S.Requests with @cds.search: {
  name,
  name2,
  magentoCompany
};

// Texte und Wertehilfen
annotate S.Requests with {
  status            @(
    Common.Text                    : status.text,
    Common.TextArrangement         : #TextOnly,
    Common.ValueListWithFixedValues: true,
    Common.ValueList               : {
      CollectionPath: 'Statuses',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: status_code,
          ValueListProperty: 'code'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'text'
        }
      ]
    }
  );
  processType       @(
    Common.Text                    : processTypeRef.text,
    Common.TextArrangement         : #TextOnly,
    Common.ValueListWithFixedValues: true,
    Common.ValueList               : {
      CollectionPath: 'ProcessTypes',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: processType,
          ValueListProperty: 'code'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'text'
        }
      ]
    }
  );
  statusGroup       @(
    Common.Text                    : status.groupRef.text,
    Common.TextArrangement         : #TextOnly,
    Common.ValueListWithFixedValues: true,
    Common.ValueList               : {
      CollectionPath: 'StatusGroups',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: statusGroup,
          ValueListProperty: 'code'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'text'
        }
      ]
    }
  );
  releaseState      @(
    Common.Text           : releaseStateRef.text,
    Common.TextArrangement: #TextOnly
  );
  // Freigabegrund aus der Freigabeprüfung (F-25): Text aus der Codeliste, filterbar über feste Werte
  releaseReason     @(
    Common.Text                    : releaseReasonRef.text,
    Common.TextArrangement         : #TextOnly,
    Common.ValueListWithFixedValues: true,
    Common.ValueList               : {
      CollectionPath: 'ReleaseReasons',
      Parameters    : [
        {
          $Type            : 'Common.ValueListParameterInOut',
          LocalDataProperty: releaseReason,
          ValueListProperty: 'code'
        },
        {
          $Type            : 'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'text'
        }
      ]
    }
  );
  salesOrganization @Common.ValueList: {
    CollectionPath: 'SalesOrganizations',
    Parameters    : [{
      $Type            : 'Common.ValueListParameterInOut',
      LocalDataProperty: salesOrganization,
      ValueListProperty: 'salesOrganization'
    }]
  };
  source            @Common.ValueList: {
    CollectionPath: 'Sources',
    Parameters    : [{
      $Type            : 'Common.ValueListParameterInOut',
      LocalDataProperty: source,
      ValueListProperty: 'source'
    }]
  };
  // Hilfsfelder für Kritikalität/Sichtbarkeit: nicht als Felder anzeigen
  statusCriticality  @UI.Hidden;
  rowCriticality     @UI.Hidden;
  releaseCriticality @UI.Hidden;
  editHidden         @UI.Hidden;
  // relative Wartezeit ist virtuell: weder filter- noch sortierbar (sortiert wird über waitingSince)
  waitingText        @UI.HiddenFilter;
  // Empfehlung (F-24): Code nur technisch, angezeigt wird der Text; beide virtuell, nicht filterbar
  nextStep           @UI.Hidden;
  nextStepText       @UI.HiddenFilter;
};

annotate S.Statuses with {
  code @Common.Text: text  @Common.TextArrangement: #TextFirst;
};

annotate S.ProcessTypes with {
  code @Common.Text: text  @Common.TextArrangement: #TextOnly;
};

annotate S.StatusGroups with {
  code @Common.Text: text  @Common.TextArrangement: #TextOnly;
};

annotate S.ReleaseStates with {
  code @Common.Text: text  @Common.TextArrangement: #TextOnly;
};

annotate S.ReleaseReasons with {
  code @Common.Text: text  @Common.TextArrangement: #TextOnly;
};

// Geschäftspartner-Wertehilfe (B-05): Nummer mit Name, Debitor, Debitorrolle und Magento-Company zur Auswahl
annotate S.BusinessPartners with {
  businessPartner @title: '{i18n>field.businessPartner}'  @Common.Text: name  @Common.TextArrangement: #TextFirst;
  name            @title: '{i18n>field.bpName}';
  customer        @title: '{i18n>field.customer}';
  hasCustomerRole @title: '{i18n>field.hasCustomerRole}';
  magentoCompany  @title: '{i18n>field.magentoCompany}';
};

annotate S.Requests actions {
  assignExistingCustomer(businessPartner @Common.ValueList: {
    CollectionPath: 'BusinessPartners',
    Parameters    : [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: businessPartner, ValueListProperty: 'businessPartner' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'customer' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'hasCustomerRole' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'magentoCompany' }
    ]
  });
  changeCustomerAssignment(businessPartner @Common.ValueList: {
    CollectionPath: 'BusinessPartners',
    Parameters    : [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: businessPartner, ValueListProperty: 'businessPartner' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'customer' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'hasCustomerRole' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'magentoCompany' }
    ]
  });
};

// Labels (Common.Label) – Schlüssel wie im bisherigen App-Bundle
annotate S.Requests with {
  processType          @title: '{i18n>field.processType}';
  source               @title: '{i18n>field.source}';
  status               @title: '{i18n>field.status}';
  statusGroup          @title: '{i18n>field.statusGroup}';
  customer             @title: '{i18n>field.customer}';
  businessPartner      @title: '{i18n>field.businessPartner}';
  shipToCustomer       @title: '{i18n>field.shipToCustomer}';
  contactPersonNumber  @title: '{i18n>field.contactPersonNumber}';
  magentoCompany       @title: '{i18n>field.magentoCompany}';
  magentoCustomer      @title: '{i18n>field.magentoCustomer}';
  magentoAddress       @title: '{i18n>field.magentoAddress}';
  salesOrganization    @title: '{i18n>field.salesOrganization}';
  orderExists          @title: '{i18n>field.orderExists}';
  orderVolume          @title: '{i18n>field.orderVolume}';
  currency             @title: '{i18n>field.currency}';
  creditCardPayment    @title: '{i18n>field.creditCardPayment}';
  released             @title: '{i18n>field.released}';
  releaseState         @title: '{i18n>field.releaseState}';
  releaseProcedure     @title: '{i18n>field.releaseProcedure}';
  releasedBy           @title: '{i18n>field.releasedBy}';
  releasedAt           @title: '{i18n>field.releasedAt}';
  releaseReason        @title: '{i18n>field.releaseReason}';
  releaseLimit         @title: '{i18n>field.releaseLimit}';
  priority             @title: '{i18n>field.priority}';
  waitingSince         @title: '{i18n>field.waitingSince}';
  waitingText          @title: '{i18n>field.waitingText}';
  nextStep             @title: '{i18n>field.nextStep}';
  nextStepText         @title: '{i18n>field.nextStepText}';
  inClarification      @title: '{i18n>field.inClarification}';
  clarificationComment @title: '{i18n>field.clarificationComment}';
  title                @title: '{i18n>field.title}';
  name                 @title: '{i18n>field.name}';
  name2                @title: '{i18n>field.name2}';
  name3                @title: '{i18n>field.name3}';
  name4                @title: '{i18n>field.name4}';
  street               @title: '{i18n>field.street}';
  houseNumber          @title: '{i18n>field.houseNumber}';
  street4              @title: '{i18n>field.street4}';
  street5              @title: '{i18n>field.street5}';
  postalCode           @title: '{i18n>field.postalCode}';
  city                 @title: '{i18n>field.city}';
  country              @title: '{i18n>field.country}';
  language             @title: '{i18n>field.language}';
  telephone            @title: '{i18n>field.telephone}';
  email                @title: '{i18n>field.email}';
  vatNumber            @title: '{i18n>field.vatNumber}';
  taxNumber2           @title: '{i18n>field.taxNumber2}';
  searchTerm2          @title: '{i18n>field.searchTerm2}';
  industrySector       @title: '{i18n>field.industrySector}';
  duns                 @title: '{i18n>field.duns}';
  createdBy            @title: '{i18n>field.createdBy}';
  createdAt            @title: '{i18n>field.createdAt}';
  modifiedBy           @title: '{i18n>field.modifiedBy}';
  modifiedAt           @title: '{i18n>field.modifiedAt}';
};

annotate S.SalesData with {
  salesOrganization   @title: '{i18n>field.salesOrganization}';
  distributionChannel @title: '{i18n>field.distributionChannel}';
  division            @title: '{i18n>field.division}';
  salesGroup          @title: '{i18n>field.salesGroup}';
  salesOffice         @title: '{i18n>field.salesOffice}';
  customerGroup       @title: '{i18n>field.customerGroup}';
  salesDistrict       @title: '{i18n>field.salesDistrict}';
  incoterms1          @title: '{i18n>field.incoterms1}';
  incoterms2          @title: '{i18n>field.incoterms2}';
};

annotate S.ContactPersons with {
  contactPersonNumber @title: '{i18n>field.contactPersonNumber}';
  businessPartner     @title: '{i18n>field.businessPartner}';
  magentoCustomer     @title: '{i18n>field.magentoCustomer}';
  shopRole            @title: '{i18n>field.shopRole}';
  title               @title: '{i18n>field.title}';
  firstName           @title: '{i18n>field.firstName}';
  lastName            @title: '{i18n>field.lastName}';
  function            @title: '{i18n>field.function}';
  department          @title: '{i18n>field.department}';
  language            @title: '{i18n>field.language}';
  telephone           @title: '{i18n>field.telephone}';
  email               @title: '{i18n>field.email}';
};

annotate S.ShipToParties with {
  shipToCustomer     @title: '{i18n>field.shipToCustomer}';
  businessPartner    @title: '{i18n>field.businessPartner}';
  magentoAddress     @title: '{i18n>field.magentoAddress}';
  addressUsedInOrder @title: '{i18n>field.addressUsedInOrder}';
  name               @title: '{i18n>field.name}';
  name2              @title: '{i18n>field.name2}';
  name3              @title: '{i18n>field.name3}';
  name4              @title: '{i18n>field.name4}';
  street             @title: '{i18n>field.street}';
  houseNumber        @title: '{i18n>field.houseNumber}';
  street4            @title: '{i18n>field.street4}';
  street5            @title: '{i18n>field.street5}';
  postalCode         @title: '{i18n>field.postalCode}';
  city               @title: '{i18n>field.city}';
  country            @title: '{i18n>field.country}';
  vatNumber          @title: '{i18n>field.vatNumber}';
};

annotate S.LogEntries with {
  line          @title: '{i18n>log.line}';
  messageType   @title: '{i18n>log.type}';
  messageClass  @title: '{i18n>log.messageClass}';
  messageNumber @title: '{i18n>log.messageNumber}';
  messageText   @title: '{i18n>log.messageText}';
  step          @title: '{i18n>log.step}';
  fieldName     @title: '{i18n>log.fieldName}';
  oldValue      @title: '{i18n>log.oldValue}';
  newValue      @title: '{i18n>log.newValue}';
  createdBy     @title: '{i18n>log.createdBy}';
  createdAt     @title: '{i18n>log.createdAt}';
  criticality   @UI.Hidden;
};
