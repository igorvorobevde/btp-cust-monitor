# 03 – Service-Vertrag (CAP, OData V4)

Dieser Vertrag gilt für Phase 1 (Mock) **und** Phase 2 (Delegation an S/4) unverändert. Änderungen nur nach Abstimmung (siehe CLAUDE.md).

- Service: `CustomerMonitorService`, Pfad `/odata/v4/monitor`
- Sprache der Texte: über `Accept-Language` (CAP `localized`), Fallback EN

---

## 1. Glossar ABAP → CDS

| ABAP (ZEC_CUSTOMER / Payload) | CDS-Element | Bemerkung |
|---|---|---|
| GUID | `ID` | UUID |
| PROC_TYPE | `processType` | |
| STATUS | `status_code` (Assoziation `status`) | |
| SOURCE | `source` | |
| KUNNR | `customer` | Debitor |
| PARTNER | `businessPartner` | Geschäftspartner |
| KUNNR_WE | `shipToCustomer` | Warenempfänger |
| PARNR | `contactPersonNumber` | Ansprechpartner (KNVK) |
| MAGENTO_COMPANY / _CUSTOMER / _ADDRESS | `magentoCompany` / `magentoCustomer` / `magentoAddress` | |
| VKORG / VTWEG / SPART | `salesOrganization` / `distributionChannel` / `division` | |
| VKGRP / VKBUR / KDGRP / BZIRK | `salesGroup` / `salesOffice` / `customerGroup` / `salesDistrict` | |
| ORDER_EXISTS / ORDER_VOLUME / CURRENCY | `orderExists` / `orderVolume` / `currency` | |
| CREDITCARD | `creditCardPayment` | |
| RELEASED / RELPROC / RELUSR / RELDAT+RELTIM | `released` / `releaseProcedure` / `releasedBy` / `releasedAt` | |
| IN_CLARIFICATION / CLARI_COMMEND | `inClarification` / `clarificationComment` | |
| CRUSR/CRDAT/CRTIM, CHUSR/CHDAT/CHTIM | `createdBy`/`createdAt`, `modifiedBy`/`modifiedAt` | `modifiedAt` = ETag |
| STCEG / STCD2 / SEARCHTERM2 / BRSCH / DUNS | `vatNumber` / `taxNumber2` / `searchTerm2` / `industrySector` / `duns` | |
| PARH4 | `shopRole` | Webshop-Rolle des Ansprechpartners |
| Schritt (STEP) | `step` | Codes unverändert (`CREATE`, `AP_MODIFY`, …) |

## 2. Datenmodell (`db/schema.cds`, Entwurf)

> Feldlisten basieren auf den Entitäten von `ZEC_CUSTOMER_CREATE_SRV` und der ABAP-Analyse. Die exakten Bildschirmfelder der Altstrukturen `ZECSTR_CUSTOMER_MAIN_DYN`, `_ADMIN_DYN`, `_SALES_DYN`, `ZECSTR_CUSTOMER_SHIPTO` sind noch per SE11-Export abzugleichen (Backlog F-01).

```cds
namespace hydac.custmon;
using { managed, cuid } from '@sap/cds/common';

type ProcessType : String(6)  enum { CR_DEB; CH_DEB; CR_AP; CH_AP; CR_WE; };
type StatusCode  : String(3);
type StepCode    : String(10);
type ReleaseProc : String(10) enum { NOT_REL; AUTOMATIC; MANUAL; };
type StepInput   : String(20) enum { NONE; CONFIRM; BUSINESS_PARTNER; TEXT; };

entity Requests : cuid, managed {            // managed: createdAt/By, modifiedAt/By
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
  orderVolume          : Decimal(15,2);
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
  salesData            : Composition of one SalesData      on salesData.request = $self;
  admin                : Composition of one ContactPersons on admin.request     = $self;
  shipTo               : Composition of one ShipToParties  on shipTo.request    = $self;
  log                  : Association to many LogEntries    on log.request       = $self;   // Assoziation: kein Draft-Zustand (E-12)
  // Codelisten-Navigation (unmanaged, keine neuen Spalten) – F-11
  processTypeRef       : Association to ProcessTypes  on processTypeRef.code  = processType;
  releaseStateRef      : Association to ReleaseStates on releaseStateRef.code = releaseState;
  // berechnet on-read, read-only, filter-/sortierbar – F-11 (siehe §8)
  statusGroup          : String(10) = status.group;
  statusCriticality    : Integer    = status.criticality;
  orderCriticality     : Integer    = case when orderExists = true then 5 else 0 end;
  releaseCriticality   : Integer    = case when released = true then 3 else 2 end;
  releaseState         : String(12) = (case when released = true then releaseProcedure else 'NOT_RELEASED' end) stored;
  // berechnet
  virtual isEditable   : Boolean;            // Status offen (0xx/1xx), freigegeben und Rolle MonitorEditor; auf eigenem Entwurf true
  virtual editHidden   : Boolean;            // = !isEditable → UI.UpdateHidden (Sichtbarkeit „Bearbeiten“, E-12)
}

entity SalesData : cuid {
  request              : Association to Requests;
  salesOrganization    : String(4);
  distributionChannel  : String(2);
  division             : String(2);
  salesGroup           : String(3);
  salesOffice          : String(4);
  customerGroup        : String(2);
  salesDistrict        : String(6);
  incoterms1           : String(3);
  incoterms2           : String(28);
}

entity ContactPersons : cuid {
  request              : Association to Requests;
  contactPersonNumber  : String(10);        // read-only
  businessPartner      : String(10);        // read-only
  magentoCustomer      : String(10);        // read-only
  shopRole             : String(2);
  title                : String(4);
  firstName            : String(40);
  lastName             : String(40);
  function             : String(2);
  department           : String(4);
  language             : String(2);
  telephone            : String(30);
  email                : String(241);
}

entity ShipToParties : cuid {
  request              : Association to Requests;
  shipToCustomer       : String(10);        // read-only
  businessPartner      : String(10);        // read-only
  magentoAddress       : String(10);        // read-only
  addressUsedInOrder   : Boolean;           // read-only
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
  vatNumber            : String(20);
}

entity LogEntries {
  key request          : Association to Requests;
  key line             : Integer;
  messageType          : String(1);         // S I W E A
  messageClass         : String(20);
  messageNumber        : String(3);
  messageText          : String(255);       // serverseitig aufgelöst
  step                 : StepCode;
  fieldName            : String(30);
  oldValue             : String(255);
  newValue             : String(255);
  createdBy            : String(255);
  createdAt            : Timestamp;
  criticality          : Integer;           // berechnet aus messageType: S 3, W 2, E/A 1, I 5 – F-11
}

// Customizing (read-only, Texte sprachabhängig)
entity Statuses     { key code : StatusCode;  text : localized String(60); icon : String(30); group : String(10); /* OPEN|ERROR|REJECTED|DONE */
                      criticality : Integer; /* UI.CriticalityType: 5 Information (OPEN), 1 Negative (ERROR), 0 Neutral (REJECTED), 3 Positive (DONE) – F-11 */ }
entity StatusGroups  { key code : String(10); text : localized String(60); }   // OPEN|ERROR|REJECTED|DONE – Codeliste für den Filter „Statusgruppe“ (F-11)
entity ReleaseStates { key code : String(12); text : localized String(60); }   // NOT_RELEASED|NOT_REL|AUTOMATIC|MANUAL – Codeliste für die Kopfanzeige „Freigabe“ (F-11)
entity ProcessTypes { key code : ProcessType; text : localized String(60); }
entity Steps        { key code : StepCode;    text : localized String(60); successStatus : StatusCode; errorStatus : StatusCode; input : StepInput; }
entity ProcessSteps { key source : String(10); key processType : ProcessType; key status : StatusCode; key step : StepCode; }   // nur Mock, nicht exponiert
entity ApprovalRules { key processType : ProcessType; key source : String(10); key salesOrganization : String(4);
                       limit : Decimal(15,2); currency : String(5); creditCard : Boolean; notRequired : Boolean; }       // nur Mock, nicht exponiert
```

## 3. Service (`srv/monitor-service.cds`, Entwurf)

```cds
using hydac.custmon as db from '../db/schema';

service CustomerMonitorService @(path: '/odata/v4/monitor') {

  @odata.draft.enabled                       // E-12
  @UI.UpdateHidden: editHidden               // „Bearbeiten“ nur sichtbar, wenn bearbeitbar
  @(Capabilities: { InsertRestrictions.Insertable: false, DeleteRestrictions.Deletable: false })
  @restrict: [ { grant: 'READ', to: 'MonitorViewer' },
               { grant: ['UPDATE', 'release', 'rejectRequest', 'clarify', 'reset', 'createCustomer', 'createShipTo',
                         'modifyContact', 'convertToNewCustomer', 'completeManually',
                         'assignExistingCustomer', 'changeCustomerAssignment'], to: 'MonitorEditor' } ]
  entity Requests as projection on db.Requests actions {        // eine gebundene Aktion je Schritt (E-04)
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canRelease )
    action release(in : $self) returns Requests;                                                        // RELEASE
    @Core.OperationAvailable: ( :in.canReject )
    action rejectRequest(in : $self, @mandatory @UI.MultiLineText reason : String(100)) returns Requests; // REJECT
    @Core.OperationAvailable: ( :in.canClarify )
    action clarify(in : $self, @mandatory @UI.MultiLineText comment : String(100)) returns Requests;      // CLARIFY
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canReset )
    action reset(in : $self) returns Requests;                                                          // RESET
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canCreateCustomer )
    action createCustomer(in : $self) returns Requests;                                                 // CREATE
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canCreateShipTo )
    action createShipTo(in : $self) returns Requests;                                                   // CREATE_WE
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canModifyContact )
    action modifyContact(in : $self) returns Requests;                                                  // AP_MODIFY
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canConvertToNewCustomer )
    action convertToNewCustomer(in : $self) returns Requests;                                           // CNG_NEW
    @Common.IsActionCritical @Core.OperationAvailable: ( :in.canCompleteManually )
    action completeManually(in : $self) returns Requests;                                               // MANUAL_OK
    @Core.OperationAvailable: ( :in.canAssignExistingCustomer )
    action assignExistingCustomer(in : $self, @mandatory businessPartner : String(10)) returns Requests;  // CHNG_OLD
    @Core.OperationAvailable: ( :in.canChangeCustomerAssignment )
    action changeCustomerAssignment(in : $self, @mandatory businessPartner : String(10)) returns Requests; // CNG_DEBI
  };
  // Jede Aktion trägt @Common.SideEffects (Status, Flags, Zuordnung, modifiedAt; log, admin, shipTo, salesData)

  entity SalesData      as projection on db.SalesData;
  entity ContactPersons as projection on db.ContactPersons;
  entity ShipToParties  as projection on db.ShipToParties;
  @readonly entity LogEntries   as projection on db.LogEntries;
  @readonly entity Statuses     as projection on db.Statuses;
  @readonly entity ProcessTypes as projection on db.ProcessTypes;
  @readonly entity Steps        as projection on db.Steps;
  @readonly entity StatusGroups  as projection on db.StatusGroups;   // F-11
  @readonly entity ReleaseStates as projection on db.ReleaseStates;  // F-11

  // Wertehilfen (Distinct-Werte, nur Codes) – F-11
  @readonly @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'MonitorViewer', where: 'salesOrganization = $user.SalesOrg' }]
  entity SalesOrganizations as select from db.Requests distinct { key salesOrganization };
  @readonly @cds.redirection.target: false
  entity Sources            as select from db.Requests distinct { key source };
}
```

- `Requests`: kein CREATE/DELETE (Eingang kommt nur aus Magento). Muss serverseitig mit 405 abgelehnt werden, unabhängig von der Annotation; mit Draft ist `POST /Requests` das Ereignis `NEW` auf dem Entwurf und wird ebenfalls mit 405 abgelehnt.
- **Draft (E-12, entschieden 22.10.2026):** `Requests` ist `@odata.draft.enabled`. Schlüssel `Requests(ID=…,IsActiveEntity=true|false)`, Felder `HasActiveEntity`, `HasDraftEntity`, Navigation `DraftAdministrativeData`, Aktionen `draftEdit` / `draftPrepare` / `draftActivate` (CAP-generisch). `SalesData`, `ContactPersons`, `ShipToParties` sind Draft-Knoten; `log` ist eine Assoziation ohne Draft (wird nicht in den Entwurf kopiert).
- `@odata.etag` auf `modifiedAt` (Requests und Kind-Entitäten). Pflicht-`If-Match`: bei `draftEdit` (ETag des aktiven Vorgangs), bei PATCH auf Entwurf/Kind-Entwurf (ETag des Entwurfs) und bei jeder Schrittaktion am aktiven Vorgang. Fehlendes oder veraltetes `If-Match` → 412 (CAPs generisches 428 wird auf 412 abgebildet); `If-Match: *` wird bei Schrittaktionen nicht akzeptiert. `draftActivate` schreibt den aktiven Vorgang ohne erneute ETag-Prüfung – die Nebenläufigkeit sichert die Draft-Sperre.
- Read-only-Felder per `@readonly` / `@Core.Computed` annotieren (siehe Kommentare im Modell).
- Bearbeiten nur, wenn `isEditable = true`: `draftEdit` wird sonst mit 409 `NOT_EDITABLE` abgelehnt (E-11); dieselbe Prüfung läuft bei der Aktivierung. `admin` darf nur bei Prozessart ≠ CR_WE, `shipTo` nur bei CR_WE geändert werden (sonst 409 `NOT_EDITABLE` bei der Aktivierung).
- **`isEditable` berücksichtigt die Rolle (entschieden 19.10.2026):** `true` nur bei offenem Status, freigegebenem Vorgang **und** Rolle `MonitorEditor`. Die UI blendet „Bearbeiten“ über `editHidden` (= `!isEditable`, `@UI.UpdateHidden`) ein – kein separater User-Info-Endpunkt.
- Sichtbarkeit: VKORG aus Benutzerattribut `SalesOrg`, nicht freigegebene Vorgänge nur mit `MonitorReleaser` (Mock: Handler-Filter, 02 §5).
- Wertehilfen `SalesOrganizations` / `Sources` (F-11): Distinct-Werte aus `Requests`, nur Codes. `SalesOrganizations` ist deklarativ auf `$user.SalesOrg` eingeschränkt; die `released`-Einschränkung für Nicht-Freigeber gilt hier bewusst nicht (keine Vorgangsdaten).

## 4. Aktionsverfügbarkeit (`can*`-Flags)

Das Backend liefert je Vorgang und Benutzer ein virtuelles Flag pro Schrittaktion (`canRelease`, `canReject`, …, siehe Tabelle in §5). Fiori Elements bindet die Flags über `Core.OperationAvailable`; die UI rechnet nichts (CLAUDE.md Regel 5). Logik identisch Altsystem `get_functions`:

0. Ohne Rolle `MonitorEditor` → alle Flags `false`.
1. Status 8xx/9xx → nur `canReset`.
2. Nicht freigegeben → nur `canRelease` (nur mit Rolle `MonitorReleaser`), `canReject`.
3. Status 000 und nicht in Klärung → `canClarify`.
4. Plus alle `ProcessSteps` für (source, processType, status).
5. Entwürfe und aktive Vorgänge, für die ein Entwurf existiert → alle Flags `false` (Schritte und Bearbeitung schließen sich aus, §6).

Die Flags sind nie `null` und werden auch bei engem `$select` berechnet (fehlende Eingaben lädt der Service nach). Texte der Schritte stehen weiterhin in `Steps` (Protokoll, Phase 2); die Beschriftung der Aktionen kommt aus den Labels der Aktionen (`_i18n`, F-15).

## 5. Schrittaktionen

Je Schritt eine gebundene Aktion am **aktiven** Vorgang (`Requests(ID=…,IsActiveEntity=true)`), ETag Pflicht (`If-Match`, kein `*`). Rückgabe: aktualisierter Vorgang inkl. Flags; Fiori Elements lädt per Side Effects Protokoll und Kinder nach.

| Schritt (Customizing) | Aktion | Flag | Eingabe | Bestätigung |
|---|---|---|---|---|
| RELEASE | `release()` | `canRelease` | – | `Common.IsActionCritical` |
| REJECT | `rejectRequest(reason)` | `canReject` | `reason` Pflicht, max. 100 | Parameterdialog |
| CLARIFY | `clarify(comment)` | `canClarify` | `comment` Pflicht, max. 100 | Parameterdialog |
| RESET | `reset()` | `canReset` | – | IsActionCritical |
| CREATE | `createCustomer()` | `canCreateCustomer` | – | IsActionCritical (E-09) |
| CREATE_WE | `createShipTo()` | `canCreateShipTo` | – | IsActionCritical (E-09) |
| AP_MODIFY | `modifyContact()` | `canModifyContact` | – | IsActionCritical (E-09) |
| CNG_NEW | `convertToNewCustomer()` | `canConvertToNewCustomer` | – | IsActionCritical |
| MANUAL_OK | `completeManually()` | `canCompleteManually` | – | IsActionCritical |
| CHNG_OLD | `assignExistingCustomer(businessPartner)` | `canAssignExistingCustomer` | `businessPartner` Pflicht, 1–10 Ziffern | Parameterdialog; Rückfrage §5.3 |
| CNG_DEBI | `changeCustomerAssignment(businessPartner)` | `canChangeCustomerAssignment` | `businessPartner` Pflicht, 1–10 Ziffern | Parameterdialog; Rückfrage §5.3 |

Aktionen auf einem Entwurf (`IsActiveEntity=false`) → 400 `STEP_NOT_ALLOWED`; auf einem aktiven Vorgang mit vorhandenem Entwurf → 409 `DRAFT_ALREADY_EXISTS`. Phase 2: jede Aktion ruft `execute_function(step, …)` in S/4 (02 §6).

### 5.1 Ergebnisse

| Fall | HTTP | Fehlercode (`error.code`) | Wirkung |
|---|---|---|---|
| Erfolg | 200 | – | Erfolgsstatus, Log; Meldungen als `sap-messages` (Typ success/info) |
| Schritt ausgeführt, fachlicher Fehler mit Fehlerstatus (CREATE→150, CREATE_WE→160, AP_MODIFY→140) | **200** | – | Fehlerstatus gesetzt, Meldungen als `sap-messages` Typ error/warning |
| Schritt nicht erlaubt | 400 | `STEP_NOT_ALLOWED` | keine Änderung |
| Eingabe fehlt / zu lang | 400 | `INPUT_REQUIRED` / `INPUT_TOO_LONG` | keine Änderung |
| BP unbekannt | 400 | `BP_NOT_FOUND` | keine Änderung |
| BP ohne Debitorrolle | 400 | `BP_NOT_CUSTOMER` | keine Änderung (Altsystem ließ das zu, siehe 07 R-06) |
| Rückfrage nötig (CHNG_OLD/CNG_DEBI: Debitor gehört anderer Magento-Company) | 409 | `CONFIRM_REQUIRED` | nur bei `Prefer: handling=strict`; ohne Header gilt die Rückfrage als bestätigt (ersetzt `force`). Ab F-14: 412 Strict Handling (§5.3) |
| Aktion auf Entwurf / aktiver Vorgang mit Entwurf | 400 / 409 | `STEP_NOT_ALLOWED` / `DRAFT_ALREADY_EXISTS` | keine Änderung (§6) |
| Harte Vorbedingung (z. B. VKORG 2000 ohne CRM-Nummer) | 422 | `STEP_ABORTED` | keine Änderung, Meldung im Log **und** in der Antwort (07 R-04) |
| ETag veraltet | 412 | – | UI: „Vorgang wurde zwischenzeitlich geändert“ → neu laden |
| Keine Berechtigung | 403 | – | |

Hinweis Mock/CAP: Bei HTTP 200 können `sap-messages` nur bis Schweregrad *warning* transportiert werden; Meldungen eines Fehlerstatus (140/150/160) kommen daher als Warnung. Die UI wertet zusätzlich die Statusgruppe `ERROR` aus (04 §4.2).

Fehlerantworten enthalten `error.message` (übersetzt) und optional `error.details[]` (weitere Meldungen). `CONFIRM_REQUIRED` enthält in `error.message` die Rückfrage (z. B. „Debitor 4711 ist bereits Magento-Company 999 zugeordnet. Trotzdem übernehmen?“).

### 5.2 Wirkung je Schritt

Siehe [01_fachkonzept.md §6](01_fachkonzept.md#6-schritte). Zusätzlich im Mock und als Ziel für Phase 2:

- **CNG_NEW** führt die Freigabeprüfung erneut aus (07 R-02). Ergebnis kann `released = false` sein.
- **CHNG_OLD** prüft wie CNG_DEBI die bestehende Magento-Zuordnung (07 R-06).
- Jeder Schritt schreibt mindestens einen Logeintrag und aktualisiert `modifiedAt/By`.

## 6. Bearbeiten (Draft, E-12)

- Bearbeitbar: Hauptdaten (Requests), `salesData`, `admin` (nicht bei CR_WE), `shipTo` (nur bei CR_WE).
- Ablauf (Fiori Elements): `draftEdit` (mit `If-Match` des aktiven Vorgangs, 409 `NOT_EDITABLE` wenn nicht bearbeitbar) → PATCH auf `Requests(ID,IsActiveEntity=false)` bzw. `…/salesData`, `…/admin`, `…/shipTo` (jeweils mit ETag des Entwurfs; jede Änderung erhöht `modifiedAt` des Entwurfs) → `draftActivate` (mit ETag des Entwurfs) → aktiver Vorgang wird deep aktualisiert, Entwurf gelöscht, `modifiedAt` von Vorgang und Kindern erhöht. Abbrechen = Entwurf löschen (`DELETE` auf dem Entwurf, CAP-generisch).
- Server protokolliert **bei der Aktivierung** je geändertem Feld einen Logeintrag (`fieldName` mit Präfix `salesData.` / `admin.` / `shipTo.`, `oldValue`, `newValue`); unveränderte Felder (auch leer ↔ null) erzeugen keinen Eintrag.
- Sperre: Während ein Entwurf existiert, ist der Vorgang für andere Benutzer gesperrt – `draftEdit` → 409 `DRAFT_ALREADY_EXISTS`, PATCH auf fremden Entwurf → 403 `DRAFT_LOCKED_BY_ANOTHER_USER`; Schrittaktionen am aktiven Vorgang sind solange gesperrt (siehe §5). Sperrdauer `draft_lock_timeout` = 15 min, verlängert bei jeder Änderung; verwaiste Entwürfe werden nach `draft_deletion_timeout` = 7 Tage beim nächsten `draftEdit` entfernt (Konfiguration in `.cdsrc.json` → `fiori`).
- Texte der Draft-Fehler (`DRAFT_*`, `ENTITY_LOCKED`) kommen aus `_i18n/messages*.properties` (EN/DE).

## 7. Mock-Verhalten (Phase 1)

Implementiert in `srv/monitor-service.js` + `srv/lib/status-machine.js`.

**Testdaten** (`db/data/*.csv`): mindestens ein Vorgang je Kombination

| # | processType | status | Besonderheit |
|---|---|---|---|
| 1 | CR_DEB | 000 | freigegeben, VKORG 2000 |
| 2 | CR_DEB | 000 | **nicht** freigegeben, VKORG 7050 |
| 3 | CR_DEB | 150 | Name enthält „FEHLER“ (CREATE schlägt erneut fehl) |
| 4 | CH_DEB | 000 | VKORG 2000, Debitor **ohne** CRM-Nummer (AP_MODIFY → STEP_ABORTED) |
| 5 | CH_DEB | 130 | |
| 6 | CR_AP | 000 | |
| 7 | CR_AP | 140 | |
| 8 | CR_WE | 010 | VKORG 7050, nicht freigegeben |
| 9 | CR_WE | 160 | |
| 10 | CH_AP | 997 | |
| 11 | CR_DEB | 899 | ohne Debitor (RESET → CR_DEB/120) |
| 12 | CH_DEB | 999 | Bestellung vorhanden, Volumen 12.500 EUR |
| 13 | CH_DEB | 000 | in Klärung, mit Kommentar |
| 14 | CR_DEB | 000 | VKORG 0001, Kreditkarte → automatisch freigegeben, Bestellung 3.400 EUR |
| 15 | CR_DEB | 120 | nach CNG_NEW, manuell freigegeben |
| 16 | CH_DEB | 110 | Zuordnung geändert, Feldänderungen im Protokoll |
| 17 | CH_DEB | 140 | Admin-Nachname „Fehlermann“ (AP_MODIFY schlägt erneut fehl) |
| 18 | CR_DEB | 000 | VKORG 7050, **nicht** freigegeben, 25.000 EUR, in Klärung |
| 19 | CR_AP | 000 | VKORG 7050, **nicht** freigegeben |
| 20 | CR_WE | 010 | VKORG 0001, freigegeben, Adresse in Auftrag verwendet |
| 21 | CR_WE | 999 | Warenempfänger 4200021 angelegt (RESET → 010) |
| 22 | CR_DEB | 998 | manuell erledigt |
| 23 | CH_DEB | 899 | abgelehnt, mit Debitor (RESET → CH_DEB/000) |
| 24 | CR_DEB | 999 | Debitor angelegt (RESET → CH_DEB/000) |
| 25 | CH_AP | 997 | VKORG 2000 |
| 26 | CH_DEB | 000 | für CNG_DEBI: BP 1000030 frei, 1000002 Rückfrage, 1000031 ohne Debitorrolle |

#1–#13 sind die Pflicht-Kombinationen (Tests referenzieren sie), #14–#26 Demo-Daten; Drehbuch: [08_demo_szenarien.md](08_demo_szenarien.md).

Customizing-CSV = Kopie der Systemtabellen (Stand 19.10.2026, siehe 01).

**Mock-Stammdaten** (`db/data/hydac.custmon-MockBusinessPartners.csv`, nicht exponiert): BP-Nummer, Debitor, `hasCustomerRole`, `crmNumber`, `magentoCompany` – für BP-Prüfungen.
Wichtige BPs für Schritte mit BP-Eingabe: `1000030` (Debitor 4000030, frei → keine Rückfrage), `1000002` (Debitor 4000002, Magento-Company 999 → `CONFIRM_REQUIRED`), `1000003` / `1000031` (keine Debitorrolle → `BP_NOT_CUSTOMER`), jede andere Nummer → `BP_NOT_FOUND`.

**Simulation:**
- CREATE / CREATE_WE: Name enthält „FEHLER“ → Fehlerstatus + Meldung; sonst neue Nummern (Debitor 4xxxxxxx, BP 1xxxxxxx, AP 0xxxxxxxxx) und 999.
- AP_MODIFY: VKORG 2000 und Debitor ohne `crmNumber` → 422 `STEP_ABORTED`.
- `MOCK_LATENCY_MS` (env) verzögert jede Action, um Busy-Zustände zu testen.
- BP-Nummern werden ohne führende Nullen verglichen (`0001000002` = `1000002`).
- Meldungstexte (Fehler, `sap-messages`, Protokoll) aus `_i18n/messages*.properties` (EN/DE), Sprache aus `Accept-Language`.
- `STEP_ABORTED` schreibt den Protokolleintrag (Typ `A`) in einer eigenen Transaktion nach dem Rollback.
- Profil `opa` (`npm run start:test`): Auth `dummy` (privilegierter Benutzer, alle Rollen, alle VKORG) für Headless-Browsertests.
- Entwürfe liegen in Phase 1 in der In-Memory-Datenbank und gehen bei jedem Neustart von `cds watch` verloren; ab Phase 2 ist eine persistente Datenbank (HANA Cloud) erforderlich (02 §2, E-14).
- Mock-User für Sperrtests: `carol` (MonitorViewer + MonitorEditor, VKORG 0001/2000/7050).

## 8. Codelisten, Texte, Kritikalität (F-11, siehe [09](09_migration_fiori_elements.md) §4.5)

Fiori Elements leitet Farben/Icons aus Kritikalitätswerten (`UI.CriticalityType`) und Texte aus Codelisten ab. Die UI rechnet nichts mehr um (CLAUDE.md Regel 7); alle Werte kommen aus dem Service.

| Element | Quelle | Werte |
|---|---|---|
| `Statuses.criticality` | Customizing-CSV | 5 Information (Gruppe OPEN), 1 Negative (ERROR), 0 Neutral (REJECTED), 3 Positive (DONE) |
| `Requests.statusGroup` | `status.group` (on-read) | OPEN, ERROR, REJECTED, DONE – filterbar (`$filter=statusGroup eq 'OPEN'`), Wertehilfe `StatusGroups` |
| `Requests.statusCriticality` | `status.criticality` (on-read) | wie `Statuses.criticality`; sortierbar |
| `Requests.orderCriticality` | `orderExists` (on-read) | 5 bei Bestellung (Zeilen-Highlight), sonst 0 |
| `Requests.releaseState` | `released` + `releaseProcedure` (stored, neu berechnet bei UPDATE) | NOT_RELEASED (nicht freigegeben), NOT_REL / AUTOMATIC / MANUAL (freigegeben); Text über `releaseStateRef` aus `ReleaseStates` |
| `Requests.releaseCriticality` | `released` (on-read) | 3 freigegeben, 2 nicht freigegeben |
| `Requests.processTypeRef` | unmanaged Assoziation auf `ProcessTypes` | Text der Prozessart (`$expand=processTypeRef`), `processType` bleibt Enum |
| `LogEntries.criticality` | `messageType` (on-read) | S 3, W 2, E/A 1, I 5 |

Alle Elemente sind read-only; Texte folgen `Accept-Language` wie bei den übrigen Codelisten.
