# 10 – Backend-Schnittstellen: Magento-Eingang, S/4-Standard-APIs, Notifications (Entwurf, E-15)

Status: **Entwurf, 06.11.2026** – ersetzt die Fassung vom 27.10.2026 (eigener S/4-Service, Entscheidungsvorlage E-07). Grundlage: Entscheidung E-15 ([02](02_architektur.md) §3): **BTP ist das führende System für die Vorgänge, S/4 wird nur über freigegebene Standard-APIs angesprochen, es gibt keine Z-Schnittstellen mehr.** Punkte mit „zu prüfen“ sind Annahmen über den ABAP-Code bzw. die Systeme, die vor der Umsetzung verifiziert werden müssen.

Die CAP-Seite ist vorbereitet: Der Service spricht die Schrittlogik nur über `srv/backend/` an (B-04, `loadCustomizing`, `executeStep`, `saveChanges`). Die Mock-Implementierung aus Phase 1 enthält bereits die Statusmaschine, die Freigabeprüfung und alle Schritte ohne Stammdatenanlage; sie wird die Produktivlogik. Neu sind drei Dinge: der Eingang aus Magento (§2), die Aufrufe der Geschäftspartner-API in den Schritten CREATE, CREATE_WE und AP_MODIFY (§3) und die Notifications an Magento (§4). UI und OData-Vertrag ändern sich nicht (E-03, E-13), bis auf `backendSystem` ([11](11_design_review_hydac.md) §6.6).

## 1. Prinzip

| | Altsystem | Ziel (E-15) |
|---|---|---|
| Vorgangsspeicher („Buffer“) | `ZEC_CUSTOMER` (+ Payload) in S/4 | Entitäten `Requests`, `SalesData`, `ContactPersons`, `ShipToParties`, `LogEntries` in HANA Cloud |
| Eingang | Magento → `ZEC_CUSTOMER_CREATE_SRV` (SEGW) | Magento → CAP `IntakeService` (§2) |
| Freigabe, Status, Schritte | `ZCL_EC_CUSTOMER`, Schrittklassen, Customizing `ZEC_CUST_*` | `srv/lib/status-machine.js`, `srv/backend/`, Customizing-Tabellen in HANA je Backend (E-18) |
| Stammdaten | CMD-API / BAPIs in den Schrittklassen | `API_BUSINESS_PARTNER` (Standard, OData V2) je S/4-System (§3) |
| Notifications | BAdI + `ZEC_CUSTOMER_READ_SRV` / `RejectCusomterSet` | CAP-Outbox → HTTP-Destination je Magento-Shop, gleiche Ziele und Payloads (§4) |
| Berechtigung auf Vorgänge | `V_KNA1_VKO`, `V_VBAK_VKO`, `ZEC_MONITO` | CAP `@restrict` (Rolle, VKORG je Backend) – einziger Lesepfad |
| Berechtigung auf Stammdaten | im Schritt, Benutzer des Monitors | S/4 prüft den propagierten Benutzer beim API-Aufruf (Principal Propagation) |

## 2. Eingang aus Magento (`IntakeService`, E-16)

| Thema | Entwurf |
|---|---|
| Endpunkt | Eigener CAP-Service `IntakeService` (REST oder OData V4, Pfad `/intake/v1`), getrennt vom UI-Vertrag; drei Operationen: `registerCompany`, `registerContact`, `registerShipTo` (entsprechen den drei Eingangsarten, [01](01_fachkonzept.md) §1). |
| Payload | Struktur wie heute an `ZEC_CUSTOMER_CREATE_SRV` (Hauptdaten, Vertriebsdaten, Admin/Ansprechpartner, Warenempfänger, Magento-IDs, Bestellvolumen/Währung/Kreditkarte), damit TechDivision nur Endpunkt und Anmeldung umstellt. Zu prüfen: exakte Felder des heutigen Payloads (Confluence EXTHYDAC). |
| Verarbeitung | Vorgang anlegen (Prozessart aus Eingangsart und Vorhandensein von Debitor/Magento-Zuordnung), Original- und Arbeitskopie, Freigabeprüfung (`ApprovalRules` des Backends, R-02/R-07), Protokolleinträge „Eingang“ (006/008/048) und Freigabeergebnis (027/028/029) – alles Logik, die der Mock heute auf die CSV-Testdaten anwendet. `CH_AP` (Änderung bestehender Ansprechpartner) wird wie heute direkt ausgeführt (997). |
| Backend-Zuordnung | Der Eingang trägt `backendSystem` (EU/US/AU) – aus dem Shop (eigener Service Key je Shop) oder aus einem Feld; VKORG muss zum Backend passen. |
| Idempotenz | Schlüssel Magento-Company/-Customer/-Address + Eingangsart: Wiederholung desselben Eingangs erzeugt keinen zweiten Vorgang (R-11-Prinzip auch am Eingang). |
| Anmeldung | OAuth 2.0 Client Credentials gegen XSUAA (eigener Service Key je Shop/Region, Scope `IntakeClient`); Magento spricht BTP über das Internet an. Optional API-Management-Proxy (Integration Suite) mit API-Key, Spike Arrest und Analytics, wenn HYDAC externe Aufrufe zentral führen will. Kein iFlow erforderlich; ein iFlow nur, falls Magento den Payload nicht anpassen kann und eine Transformation nötig wird. |
| Fehler | 400 mit Meldungsliste (fehlende Pflichtfelder), 409 bei Duplikat (gleiche Magento-IDs, offener Vorgang), 503 wenn HANA nicht erreichbar; Magento wiederholt. |

## 3. S/4 über die Geschäftspartner-API (`API_BUSINESS_PARTNER`)

Ein Adapter `srv/backend/s4-bp.js` kapselt die Aufrufe: CAP-Remote-Service aus `cds import API_BUSINESS_PARTNER.edmx` (kind `odata-v2`), Destination je Backend aus der Backend-Registry, SAP Cloud SDK darunter (Destination, Cloud Connector, Principal Propagation). CAP führt OData-V2-Outbound als „deprecated“; der Adapter bleibt so dünn, dass er auf den OData-V2-Client des SAP Cloud SDK wechseln kann, ohne dass die Schritte sich ändern.

### 3.1 Schritte → API-Aufrufe

| Schritt | Altsystem | Aufrufe auf `API_BUSINESS_PARTNER` | Hinweis |
|---|---|---|---|
| CREATE (`CR_DEB`) | BP + Debitor anlegen (CMD-API), Magento-Company zuordnen, Admin-Ansprechpartner anlegen; VKORG 7110 zusätzlich Spediteur | `POST A_BusinessPartner` (Organisation, Adresse `to_BusinessPartnerAddress`, Rollen `to_BusinessPartnerRole` FLCU00/FLCU01, Steuernummern `to_BusinessPartnerTax`) mit Deep Insert `to_Customer` (`A_Customer`, `to_CustomerCompany`, `to_CustomerSalesArea`); danach `POST A_BusinessPartnerContact` (+ `to_ContactAddress`, `to_ContactRelationship` mit Funktion/Abteilung) für den Admin | Nummernvergabe: intern (Antwort liefert `BusinessPartner`/`Customer`) – zu prüfen: Gruppierung/Nummernkreis je VKORG. Spediteur 7110: Lieferantenrolle über dieselbe API (`to_Supplier`) – zu prüfen, ob AU/US das brauchen |
| CREATE bei vorhandenem BP ohne Debitor (`CH_DEB`-Variante) | Debitorrolle ergänzen | `POST A_BusinessPartner('…')/to_BusinessPartnerRole` + `to_Customer` | |
| AP_MODIFY (`CR_AP`, `CH_DEB`) | Ansprechpartner anlegen oder ändern; VKORG 2000: CRM-Nummer am Debitor Pflicht | `GET A_BusinessPartnerContact` (vorhanden?), `POST`/`PATCH A_BusinessPartnerContact`, `A_BPContactToAddress`, `A_BPContactToFuncAndDept` | CRM-Nummer: welches Feld? Wenn Z-Feld → Key-User-Custom-Field am Debitor (wird in der API ausgespielt) oder Regel entfällt – zu prüfen mit HYDAC |
| CREATE_WE (`CR_WE`) | Warenempfänger anlegen (oder gespeicherte Nummer wiederverwenden), dem Auftraggeber zuordnen, Magento-Address zuordnen | `POST A_BusinessPartner` mit `to_Customer` (Warenempfänger als Debitor), dann `POST A_CustSalesPartnerFunc` am Auftraggeber (Partnerrolle Warenempfänger `SH`/`WE`, Vertriebsbereich des Vorgangs) | Erzeugte Nummer **sofort** am Vorgang persistieren, Zuordnung als zweiter, wiederholbarer Teilschritt (R-11) |
| CHNG_OLD, CNG_DEBI | BP-Nummer erfassen, Debitor ermitteln, Rückfrage bei fremder Magento-Company | `GET A_BusinessPartner('…')?$expand=to_Customer,to_BusinessPartnerRole` | Prüfung `BP_NOT_FOUND` / `BP_NOT_CUSTOMER` (R-06); Magento-Zuordnung aus HANA, nicht aus S/4 |
| Wertehilfe Geschäftspartner (B-05) | – | `GET A_BusinessPartner?$filter=substringof(…)&$expand=to_Customer` (Nummer, Name, Debitor, Debitorrolle) + lokale Magento-Zuordnung | nur im Backend des Vorgangs; Trefferzahl begrenzen |
| REJECT, CLARIFY, RELEASE, RESET, CNG_NEW, MANUAL_OK | nur Status/Protokoll | **kein S/4-Aufruf** | |

### 3.2 Magento-Zuordnung

Heute hängt die Magento-Company am Debitor (zu prüfen: Feld oder Z-Tabelle). Ziel: Zuordnungstabelle in HANA (`MagentoAssignments`: Backend, Magento-Company/-Customer/-Address ↔ Geschäftspartner/Debitor/Ansprechpartner/Warenempfänger), gepflegt von den Schritten und beim Cutover aus S/4 übernommen (B-08). Vorteil: keine Z-Felder in S/4 nötig, Rückfragen (R-06) und die Wertehilfe lesen lokal. Soll die Zuordnung zusätzlich in S/4 sichtbar sein, reicht ein Key-User-Custom-Field am Geschäftspartner, das die API mitschreibt – HYDAC entscheidet.

### 3.3 Verfügbarkeit der API je Backend

| Backend | Bereitstellung | Benutzerweitergabe | Zu prüfen |
|---|---|---|---|
| S/4 on-premise (Q4H/GWQ, PRD) | Standard-Service `API_BUSINESS_PARTNER` (OData V2) aktivieren (`/IWFND/MAINT_SERVICE`), Cloud-Connector-Pfad `/sap/opu/odata/sap/API_BUSINESS_PARTNER/` | Principal Propagation (X.509 über Cloud Connector, `CERTRULE`); übergangsweise technischer Benutzer | Release/SP von Q4H (die API ist seit 1709 enthalten; bei fehlendem Eintrag SAP-Hinweis 3518445 prüfen), Berechtigungen für BP-/Debitoranlage je VKORG |
| S/4HANA Public Cloud (AU) | Kommunikationsszenario `SAP_COM_0008` (Business Partner, Customer and Supplier Integration), Kommunikationssystem + -vereinbarung | OAuth 2.0 SAML Bearer Assertion (Destination `OAuth2SAMLBearerAssertion`, Business User mit passender Business-Rolle); sonst Zertifikat mit Kommunikationsbenutzer | Nummernkreise, Custom Fields, ob `SAP_COM_0008` im Tenant OAuth 2.0 inbound zeigt |
| S/4 USA | wie EU (gleiches System) oder eigenes on-premise-System | wie EU | System bestätigen ([11](11_design_review_hydac.md) §9) |

Es ist **keine ABAP-Entwicklung** in einem der Systeme nötig – auch nicht in der Public Cloud, wo die freigegebenen ABAP-Cloud-Objekte (`I_BusinessPartnerTP_3`) ohnehin keine Debitorrollen anlegen können (SAP-Hinweis 3655149).

### 3.4 Fehlerabbildung

| API-Ergebnis | CAP-Antwort ([03](03_service_vertrag.md) §5) |
|---|---|
| BP nicht gefunden / ohne Debitorrolle (CHNG_OLD, CNG_DEBI) | 400 `BP_NOT_FOUND` / `BP_NOT_CUSTOMER` |
| Rückfrage (fremde Magento-Company, aus HANA) | 412 `CONFIRM_REQUIRED` + `Preference-Applied: handling=strict` |
| Fachlicher Fehler der API (Pflichtfeld, Nummernkreis, Sperre) | Fehlerstatus 140/150/160, Meldungen der API ins Protokoll und als `sap-messages` (R-09: alle Teilergebnisse) |
| API nicht erreichbar / 5xx / Destination fehlt | 503 `BACKEND_UNAVAILABLE`, Vorgang unverändert, Protokolleintrag |
| Teilerfolg (BP angelegt, Zuordnung fehlgeschlagen) | Nummer persistiert, Fehlerstatus; Wiederholung setzt beim fehlenden Teilschritt fort (R-11) |
| Version veraltet | 412 `ETAG_REQUIRED` (CAP-Standard) |
| Keine Berechtigung in S/4 (propagierter Benutzer) | 403 mit Meldung der API |

## 4. Notifications an Magento (E-17)

| Auslöser | Ziel (wie heute, [01](01_fachkonzept.md) §9) | Inhalt | Mechanik |
|---|---|---|---|
| CREATE, CREATE_WE, AP_MODIFY erfolgreich | ID-Notification (`ZEC_CUSTOMER_READ_SRV`-Pendant beim Shop; Magento liest nach) | Debitornummer, Magento-IDs | Outbox-Nachricht in derselben Transaktion wie der Statuswechsel; Versand nach Commit über Destination `MAGENTO_<Backend>`; Wiederholung mit Backoff; Ergebnis (Erfolg/Fehler, Zeit) als Protokolleintrag (R-03/R-04) |
| REJECT | `RejectCusomterSet` (Schreibweise bleibt, R-16) | Magento-Company, Magento-Customer, bei `CR_WE` zusätzlich Magento-Address (R-05, mit TechDivision klären) | wie oben |
| Debitorpflege mit Partnerrolle ZO (BAdI im Altsystem) | – | – | **Nicht Teil des Monitors.** Wenn HYDAC auch diesen Z-BAdI ablösen will: Business-Partner-Ereignis aus S/4 (on-premise: Event Enablement / Advanced Event Mesh; Public Cloud: Standard-Event `BusinessPartner.Changed`) → CAP → Magento. Separates Arbeitspaket. |

Was Magento heute nach der ID-Notification aus S/4 nachliest (`ZEC_CUSTOMER_READ_SRV`), liefert künftig entweder der `IntakeService` (Leseoperation auf den Vorgang) oder die Notification trägt die Daten gleich mit – zu klären mit TechDivision.

## 5. Destinations und Authentifizierung

| Destination | Typ | Authentifizierung | Verwendung |
|---|---|---|---|
| `S4_EU` (`S4_US`) | OnPremise (Cloud Connector), `URL` = virtueller Host GWQ | `PrincipalPropagation` (DEV-Start: `BasicAuthentication` mit technischem Benutzer) | §3 |
| `S4_AU` | Internet | `OAuth2SAMLBearerAssertion` (Audience, Token-Service-URL und Client aus der Kommunikationsvereinbarung; `nameIdFormat` E-Mail) oder `ClientCertificateAuthentication` | §3 |
| `MAGENTO_EU`, `MAGENTO_US`, `MAGENTO_AU` | Internet | wie heute von S/4 aus (Basic oder Token; zu prüfen bei TechDivision) | §4 |

Backend-Registry (Konfiguration, kein Code): `backendSystem` → Destination S/4, Destination Magento, Adaptertyp (`s4-bp`), Nummernregeln. Neue Region = neuer Eintrag + zwei Destinations.

## 6. B-02: Popups der Schrittklassen → Parameter (bleibt gültig, bereits im Vertrag)

| Popup im Altsystem | Ersatz im CAP-Vertrag | Schritte |
|---|---|---|
| `ZEC_CUST_POPUP_DECLINE` (Ablehnungsgrund) | Parameter `reason` (Pflicht, ≤ 100 Zeichen, Original-Schreibweise, R-14) | REJECT |
| `POPUP_GET_VALUES*` (Klärungskommentar) | Parameter `comment` (Pflicht, ≤ 100 Zeichen) | CLARIFY |
| `POPUP_GET_VALUES*` (Geschäftspartner) | Parameter `businessPartner` (Pflicht) | CHNG_OLD, CNG_DEBI |
| `POPUP_TO_CONFIRM` (Rückfrage) | Strict Handling: 412 `CONFIRM_REQUIRED`, Wiederholung ohne `Prefer`-Header | CHNG_OLD, CNG_DEBI (E-09: auch CREATE / CREATE_WE / AP_MODIFY) |

Ein Refactoring der ABAP-Schrittklassen entfällt; sie werden nicht mehr aufgerufen.

## 7. Altsystem-Befunde (07) und wo sie gelöst werden

R-01 (ETag + Zeilensperre je Vorgang in einer HANA-Transaktion), R-02 (Freigabeprüfung bei Prozessartwechsel, vorhanden im Mock), R-03/R-04 (Outbox: Versand nach Commit, Ergebnis im Protokoll, Aktion „erneut senden“), R-05 (adressgenaue Ablehnung – Payload mit TechDivision), R-06 (`BP_NOT_CUSTOMER`, Rückfrage aus lokaler Zuordnung), R-07 (Limitwährung in `ApprovalRules`), R-09–R-11 (Teilergebnisse protokollieren, kein Dump, Nummern sofort persistieren), R-15 (Statustexte in HANA pflegbar), R-16 (Subscription-Namen unverändert). Alle in CAP; S/4 ist nicht mehr beteiligt.

## 8. Was in S/4 bleibt und was entfällt

| Objekt | Ziel |
|---|---|
| `ZEC_CUSTOMER`, `ZEC_CUST_*` (Tabellen, Customizing) | Nach dem Cutover nur noch Historie; Customizing lebt in HANA (E-18). Offene Vorgänge werden übernommen (B-08). |
| `ZEC_CUSTOMER_CREATE_SRV`, `ZEC_CUSTOMER_READ_SRV`, `RejectCusomterSet` | Entfallen, sobald Magento auf BTP zeigt (Parallelbetrieb während des Cutovers). |
| `ZCL_EC_CUSTOMER`, Schrittklassen, Report `ZEC_CUSTOMER_MONITOR` | Entfallen. |
| BAdI `CUSTOMER_EXTENSION_CHECK` (Notification bei Partnerrolle ZO) | Außerhalb des Monitors; Ablösung über Business-Partner-Ereignisse möglich (§4). |
| Z-Felder am Debitor (Magento-Company, ggf. CRM-Nummer) | Zuordnung nach HANA; falls in S/4 sichtbar gewünscht: Key-User-Custom-Field. Zu prüfen. |
| Standard: `API_BUSINESS_PARTNER`, Berechtigungen, Nummernkreise | Bleibt; muss aktiviert und über Cloud Connector bzw. `SAP_COM_0008` erreichbar sein. |

## 9. Nächste Schritte

1. Mit HYDAC/TechDivision die heutigen Payloads (Eingang, Notifications) und die Magento-Nachlese bestätigen (§2, §4).
2. „Zu prüfen“-Punkte im System klären: Nummernkreise/Gruppierung je VKORG, Z-Felder am Debitor (Magento-Company, CRM-Nummer), Spediteur 7110, Q4H-Release und Aktivierung von `API_BUSINESS_PARTNER`.
3. CAP: `cds import` des EDMX, Adapter `s4-bp.js` mit `cds mock` lokal (B-03); `IntakeService` (B-01); Outbox (B-07); Customizing-Tabellen + Pflege-App (B-06).
4. Destination + Cloud Connector + Principal Propagation auf DEV (B-04), danach AU über `SAP_COM_0008` (2b).
5. Cutover-Werkzeuge: Export offener Vorgänge und Magento-Zuordnungen aus S/4 (CSV/OData), Import in HANA, Umschaltplan mit TechDivision (B-08).
