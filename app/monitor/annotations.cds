/**
 * Layout-Annotationen der Fiori-Elements-App (docs/09 §5.3). Vertrags-Semantik (Labels, Texte,
 * Wertehilfen, Kritikalität, Side Effects) liegt in srv/monitor-annotations.cds (E-13).
 */
using CustomerMonitorService as service from '../../srv/monitor-service';

annotate service.Requests with @(
  // ---------- Kopf (Liste: Tabellentitel „Vorgänge (n)“, Detail: Titel/Untertitel) ----------
  UI.HeaderInfo                           : {
    TypeName      : '{i18n>request}',
    TypeNamePlural: '{i18n>requests}',
    Title         : {
      $Type: 'UI.DataField',
      Value: name
    },
    Description   : {
      $Type: 'UI.DataField',
      Value: processType
    }
  },

  // ---------- Liste: Filterleiste (docs/04 §2.1, D-2) ----------
  UI.SelectionFields                      : [
    statusGroup,
    released,
    inClarification,
    customer,
    salesOrganization,
    processType,
    status_code,
    source,
    orderExists,
    createdAt,
    createdBy,
    modifiedAt,
    modifiedBy
  ],

  // Standardfilter: Statusgruppe OPEN + ERROR (= offene Vorgänge), Sortierung createdAt aufsteigend
  UI.SelectionVariant #Default            : {
    Text         : 'Default',
    SelectOptions: [{
      $Type       : 'UI.SelectOptionType',
      PropertyName: statusGroup,
      Ranges      : [
        {
          $Type : 'UI.SelectionRangeType',
          Sign  : #I,
          Option: #EQ,
          Low   : 'OPEN'
        },
        {
          $Type : 'UI.SelectionRangeType',
          Sign  : #I,
          Option: #EQ,
          Low   : 'ERROR'
        }
      ]
    }]
  },
  UI.PresentationVariant #Default         : {
    SortOrder     : [{
      Property  : createdAt,
      Descending: false
    }],
    Visualizations: ['@UI.LineItem']
  },
  UI.SelectionPresentationVariant #Default: {
    Text               : 'Default',
    SelectionVariant   : ![@UI.SelectionVariant#Default],
    PresentationVariant: ![@UI.PresentationVariant#Default]
  },

  // ---------- Liste: Spalten (docs/04 §2.2; Importance High = kein Popin) ----------
  UI.LineItem                             : [
    {
      $Type                    : 'UI.DataField',
      Value                    : status_code,
      Criticality              : statusCriticality,
      CriticalityRepresentation: #WithIcon,
      ![@UI.Importance]        : #High
    },
    // Spalte „Hinweise“: Custom Column (manifest), verankert nach status_code
    {
      $Type            : 'UI.DataField',
      Value            : processType,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataFieldForAnnotation',
      Target           : '@UI.FieldGroup#Name',
      Label            : '{i18n>column.name}',
      ![@UI.Importance]: #High
    },
    {
      $Type            : 'UI.DataField',
      Value            : customer,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : salesOrganization,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : magentoCompany,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : orderVolume,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataFieldForAnnotation',
      Target           : '@UI.FieldGroup#Created',
      Label            : '{i18n>column.created}',
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataFieldForAnnotation',
      Target           : '@UI.FieldGroup#Changed',
      Label            : '{i18n>column.changed}',
      ![@UI.Importance]: #Medium
    }
  ],
  // Zeilen-Highlight „Bestellung vorhanden“ (5 = Information)
  UI.LineItem.@UI.Criticality             : rowCriticality,

  UI.FieldGroup #Name                     : {Data: [
    {Value: name},
    {Value: name2}
  ]},
  UI.FieldGroup #Created                  : {Data: [
    {Value: createdAt},
    {Value: createdBy}
  ]},
  UI.FieldGroup #Changed                  : {Data: [
    {Value: modifiedAt},
    {Value: modifiedBy}
  ]}
);

// ---------- Object Page (docs/04 §3) ----------
annotate service.Requests with @(
  // Kopfaktionen: ein Menü „Schritt ausführen“ mit allen Schrittaktionen; Verfügbarkeit über can*-Flags
  // (Core.OperationAvailable, srv), destruktive Schritte (Ablehnen, Zurücksetzen) zuletzt
  UI.Identification            : [{
    $Type  : 'UI.DataFieldForActionGroup',
    ID     : 'Steps',
    Label  : '{i18n>menu.steps}',
    Actions: [
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.release',
        Label : '{i18n>action.release}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.createCustomer',
        Label : '{i18n>action.createCustomer}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.createShipTo',
        Label : '{i18n>action.createShipTo}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.modifyContact',
        Label : '{i18n>action.modifyContact}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.assignExistingCustomer',
        Label : '{i18n>action.assignExistingCustomer}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.changeCustomerAssignment',
        Label : '{i18n>action.changeCustomerAssignment}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.convertToNewCustomer',
        Label : '{i18n>action.convertToNewCustomer}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.completeManually',
        Label : '{i18n>action.completeManually}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.clarify',
        Label : '{i18n>action.clarify}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.rejectRequest',
        Label : '{i18n>action.rejectRequest}'
      },
      {
        $Type : 'UI.DataFieldForAction',
        Action: 'CustomerMonitorService.reset',
        Label : '{i18n>action.reset}'
      }
    ]
  }],

  UI.HeaderFacets              : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'StatusPoint',
      Target: '@UI.DataPoint#Status'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'ReleasePoint',
      Target: '@UI.DataPoint#Release'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'KeyFigures',
      Label : '{i18n>facet.keyFigures}',
      Target: '@UI.FieldGroup#KeyFigures'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'AdminData',
      Label : '{i18n>facet.adminData}',
      Target: '@UI.FieldGroup#AdminData'
    }
  ],
  UI.DataPoint #Status         : {
    Value      : status_code,
    Title      : '{i18n>facet.status}',
    Criticality: statusCriticality
  },
  UI.DataPoint #Release        : {
    Value      : releaseState,
    Title      : '{i18n>facet.release}',
    Criticality: releaseCriticality
  },
  UI.FieldGroup #KeyFigures    : {Data: [
    {Value: customer},
    {Value: businessPartner},
    {Value: salesOrganization},
    {Value: orderExists},
    {Value: orderVolume}
  ]},
  UI.FieldGroup #AdminData     : {Data: [
    {Value: createdBy},
    {Value: createdAt},
    {Value: modifiedBy},
    {Value: modifiedAt}
  ]},

  // Abschnitte: Ansprechpartner nur bei Prozessart ≠ CR_WE, Warenempfänger nur bei CR_WE (UI.Hidden-Ausdruck, S4)
  UI.Facets                    : [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'MainSection',
      Label : '{i18n>section.main}',
      Facets: [
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'MainName',
          Label : '{i18n>group.name}',
          Target: '@UI.FieldGroup#MainName'
        },
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'MainAddress',
          Label : '{i18n>group.address}',
          Target: '@UI.FieldGroup#MainAddress'
        },
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'MainComm',
          Label : '{i18n>group.communication}',
          Target: '@UI.FieldGroup#MainComm'
        },
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'MainTax',
          Label : '{i18n>group.tax}',
          Target: '@UI.FieldGroup#MainTax'
        }
      ]
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'AdminSection',
      Label        : '{i18n>section.admin}',
      Target       : 'admin/@UI.FieldGroup#Admin',
      ![@UI.Hidden]: {$edmJson: {$Eq: [
        {$Path: 'processType'},
        'CR_WE'
      ]}}
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'SalesSection',
      Label : '{i18n>section.sales}',
      Target: 'salesData/@UI.FieldGroup#Sales'
    },
    {
      $Type        : 'UI.ReferenceFacet',
      ID           : 'ShipToSection',
      Label        : '{i18n>section.shipTo}',
      Target       : 'shipTo/@UI.FieldGroup#ShipTo',
      ![@UI.Hidden]: {$edmJson: {$Ne: [
        {$Path: 'processType'},
        'CR_WE'
      ]}}
    },
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'AssignmentSection',
      Label : '{i18n>section.assignment}',
      Facets: [
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'SapNumbers',
          Label : '{i18n>group.sapNumbers}',
          Target: '@UI.FieldGroup#SapNumbers'
        },
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'Magento',
          Label : '{i18n>group.magento}',
          Target: '@UI.FieldGroup#Magento'
        },
        {
          $Type : 'UI.ReferenceFacet',
          ID    : 'ReleaseGrp',
          Label : '{i18n>group.release}',
          Target: '@UI.FieldGroup#ReleaseGrp'
        }
      ]
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'LogSection',
      Label : '{i18n>section.log}',
      Target: 'log/@UI.PresentationVariant#Log'
    }
  ],

  UI.FieldGroup #MainName      : {Data: [
    {Value: title},
    {Value: name},
    {Value: name2},
    {Value: name3},
    {Value: name4}
  ]},
  UI.FieldGroup #MainAddress   : {Data: [
    {Value: street},
    {Value: houseNumber},
    {Value: street4},
    {Value: street5},
    {Value: postalCode},
    {Value: city},
    {Value: country}
  ]},
  UI.FieldGroup #MainComm      : {Data: [
    {Value: language},
    {Value: telephone},
    {Value: email}
  ]},
  UI.FieldGroup #MainTax       : {Data: [
    {Value: vatNumber},
    {Value: taxNumber2},
    {Value: searchTerm2},
    {Value: industrySector},
    {Value: duns}
  ]},
  UI.FieldGroup #SapNumbers    : {Data: [
    {Value: customer},
    {Value: businessPartner},
    {Value: shipToCustomer},
    {Value: contactPersonNumber}
  ]},
  UI.FieldGroup #Magento       : {Data: [
    {Value: magentoCompany},
    {Value: magentoCustomer},
    {Value: magentoAddress},
    {Value: source}
  ]},
  UI.FieldGroup #ReleaseGrp    : {Data: [
    {Value: releaseProcedure},
    {Value: releasedBy},
    {Value: releasedAt}
  ]}
);

// Kompositionen: Feldgruppen als Ziel der Facetten über die 1:1-Navigation
annotate service.ContactPersons with @(UI.FieldGroup #Admin: {Data: [
  {Value: contactPersonNumber},
  {Value: businessPartner},
  {Value: magentoCustomer},
  {Value: shopRole},
  {Value: title},
  {Value: firstName},
  {Value: lastName},
  {Value: function},
  {Value: department},
  {Value: language},
  {Value: telephone},
  {Value: email}
]});

annotate service.SalesData with @(UI.FieldGroup #Sales: {Data: [
  {Value: salesOrganization},
  {Value: distributionChannel},
  {Value: division},
  {Value: salesGroup},
  {Value: salesOffice},
  {Value: customerGroup},
  {Value: salesDistrict},
  {Value: incoterms1},
  {Value: incoterms2}
]});

annotate service.ShipToParties with @(UI.FieldGroup #ShipTo: {Data: [
  {Value: shipToCustomer},
  {Value: businessPartner},
  {Value: magentoAddress},
  {Value: addressUsedInOrder},
  {Value: name},
  {Value: name2},
  {Value: name3},
  {Value: name4},
  {Value: street},
  {Value: houseNumber},
  {Value: street4},
  {Value: street5},
  {Value: postalCode},
  {Value: city},
  {Value: country},
  {Value: vatNumber}
]});

// Protokoll: neueste zuerst
annotate service.LogEntries with @(
  UI.LineItem                 : [
    {
      $Type                    : 'UI.DataField',
      Value                    : messageType,
      Criticality              : criticality,
      CriticalityRepresentation: #WithIcon,
      ![@UI.Importance]        : #High
    },
    {
      $Type            : 'UI.DataField',
      Value            : createdAt,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : createdBy,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : step,
      ![@UI.Importance]: #Medium
    },
    {
      $Type            : 'UI.DataField',
      Value            : messageText,
      ![@UI.Importance]: #High
    },
    {
      $Type            : 'UI.DataField',
      Value            : fieldName,
      ![@UI.Importance]: #Low
    },
    {
      $Type            : 'UI.DataField',
      Value            : oldValue,
      ![@UI.Importance]: #Low
    },
    {
      $Type            : 'UI.DataField',
      Value            : newValue,
      ![@UI.Importance]: #Low
    }
  ],
  UI.PresentationVariant #Log : {
    SortOrder     : [{
      Property  : line,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem']
  }
);
