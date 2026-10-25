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
  UI.LineItem.@UI.Criticality             : orderCriticality,

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
