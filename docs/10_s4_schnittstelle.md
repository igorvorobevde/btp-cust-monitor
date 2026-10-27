# 10 – S/4-Schnittstelle (Entwurf für B-01/B-03)

Status: **Entwurf, 27.10.2026** – Grundlage für die Abstimmung mit dem S/4-Team. Abgeleitet aus dem CAP-Vertrag ([03](03_service_vertrag.md)), der Replik-Architektur (E-14, [09](09_migration_fiori_elements.md) §7) und den Befunden im Altsystem ([07](07_anforderungen_aus_altsystem.md)). Punkte mit „zu prüfen“ sind Annahmen über den ABAP-Code, die vor der Umsetzung im System verifiziert werden müssen.

Die CAP-Seite ist vorbereitet: Die Fassade spricht das führende System nur über `srv/backend/` an (B-04, `loadCustomizing`, `executeStep`, `saveChanges`). Ein S/4-Adapter implementiert genau diese Schnittstelle gegen den hier beschriebenen Service; UI und OData-Vertrag ändern sich nicht (E-03, E-13).

## 1. Entscheidungsvorlage E-07: RAP (OData V4) oder SEGW (OData V2)

| Kriterium | RAP (OData V4) | SEGW (OData V2) |
|---|---|---|
| Voraussetzung | S/4HANA ab 1909 (unmanaged RAP / Custom Entities), besser ab 2020 | jede S/4-Version |
| Aktionen/Funktionen | gebundene Aktionen, typisierte Parameter, Nachrichten als Teil der Antwort | Function Imports, Nachrichten über `sap-message`-Header |
| Delta-Lesen | `$filter` auf Änderungszeitstempel/Version in einer Custom Entity | `$filter` im DPC_EXT selbst implementiert |
| Wiederverwendung der Schrittklassen (`ZIF_EC_CUSTOMER`) | Aufruf aus dem Behavior-Pool (unmanaged save) | Aufruf aus DPC_EXT |
| CAP-Anbindung | `cds import` (EDMX V4), Remote-Service | `cds import` (EDMX V2), Remote-Service über den V2-Adapter von CAP |
| Zukunftssicherheit (Clean Core) | hoch | gering (Altmodell) |

**Empfehlung:** RAP mit Custom Entities und Aktionen, sofern das HYDAC-Release es zulässt; SEGW nur als Fallback. Für CAP ist beides gleich gut konsumierbar – die Entscheidung hängt am S/4-Release und an den Entwicklungsrichtlinien von HYDAC. **Offen, zu entscheiden von HYDAC/Purplecat** (02 §3, E-07).

## 2. Lesen (Liste, Detail, Delta)

| Ressource | Inhalt | Quelle (Altsystem) | Hinweis |
|---|---|---|---|
| `CustomerRequests` | Kopf je Vorgang: alle Felder von `Requests` nach dem Glossar 03 §1 (GUID, PROC_TYPE, STATUS, SOURCE, KUNNR, PARTNER, …) plus **Version** | `ZEC_CUSTOMER` | Schlüssel GUID |
| `CustomerRequestSalesData`, `…ContactPerson`, `…ShipTo` | strukturierte Arbeitsdaten (Vertriebs-, Admin-, WE-Daten) | `PAYLOAD_CHNG` (Arbeitskopie) | S/4 liefert die geparste Struktur, nicht das Payload-XML/JSON (zu prüfen: Format von `PAYLOAD_CHNG`) |
| `CustomerRequestLog` | Protokoll je Vorgang (Zeile, Typ, Klasse/Nummer, Text, Feld, alt/neu, Schritt, Benutzer, Zeit) | Anwendungsprotokoll des Monitors (zu prüfen: Tabelle/BAL-Objekt) | nur lesend |
| Delta | `$filter=ChangedAt gt <Zeitstempel>` über Kopf **und** Kinder/Protokoll | `CHDAT`/`CHTIM` (sekundengenau, nicht ausreichend) | neuer Änderungszeitstempel mit Sekundenbruchteilen oder Versionszähler (§4) |
| Customizing | `ProcessSteps` (`ZEC_CUST_PROCESS`), `ApprovalRules` (`ZEC_CUST_APPROV`), Status- und Schritttexte je Sprache | Customizing-Tabellen | für die Replik (lokale Flags/Empfehlung, E-14); selten geändert, Cache mit Invalidierung |
| Geschäftspartner (B-05) | Nummer, Name, Debitor, Debitorrolle, Magento-Company | Standard-API `API_BUSINESS_PARTNER` + Magento-Zuordnung (zu prüfen: wo die Magento-Company am BP hängt) | ersetzt `BusinessPartners` aus den Mock-Daten, gleiche Elemente |

Berechtigung: S/4 prüft die VKORG des Benutzers selbst (Principal Propagation, R-08: **eine** Regel für Liste und Detail). Die Fassade filtert zusätzlich lokal auf der Replik (F-23).

## 3. Funktionen

| Funktion | Eingabe | Ausgabe | CAP-Seite |
|---|---|---|---|
| `GetFunctions` | GUID | erlaubte Schrittcodes für den aktuellen Benutzer | Einzellesen; Listen rechnen lokal aus dem replizierten Customizing (E-14) |
| `ExecuteFunction` | GUID, Schritt, **Version**, `Text` (≤ 100 Zeichen), `BusinessPartner` (≤ 10), `Force` (Rückfrage bestätigt) | neuer Kopf inkl. Version + Kinder + neue Protokollzeilen + Meldungen; bei Rückfrage keine Änderung, sondern Meldung mit Code `CONFIRM_REQUIRED` und Fragetext | `backend.executeStep` → Upsert in die Replik; Rückfrage → 412 strict (03 §5.3) |
| `ChangeData` | GUID, **Version**, Liste geänderter Felder (Entität, Feld, alter Wert, neuer Wert) | neue Version; Änderungsprotokoll in S/4 (`check_changes` / `change_data` / `log_changes`) | `backend.saveChanges` in der Draft-Aktivierung vor dem lokalen UPDATE |

Schrittcodes unverändert (`RELEASE`, `REJECT`, `CLARIFY`, `RESET`, `CREATE`, `CREATE_WE`, `AP_MODIFY`, `CNG_NEW`, `MANUAL_OK`, `CHNG_OLD`, `CNG_DEBI`). Alle Funktionen laufen ohne SAP-GUI-Dialog (B-02, §6).

## 4. Versionszähler und Nebenläufigkeit

- Je Vorgang ein ganzzahliger Versionszähler, den jede Änderung (Schritt, `ChangeData`, Magento-Eingang) erhöht.
- `ExecuteFunction` und `ChangeData` prüfen die übergebene Version; weicht sie ab → Fehler „Version veraltet“ ohne Änderung. Die Fassade bildet das auf 412 `ETAG_REQUIRED` ab (03 §3) und lädt den Vorgang neu in die Replik.
- S/4 serialisiert Schritte je Vorgang (Sperre auf GUID während `ExecuteFunction`), damit zwei Benutzer nicht parallel CREATE ausführen (R-01).
- Die Replik bildet die Version auf `modifiedAt` ab (ETag bleibt `modifiedAt`, der UI-Vertrag ändert sich nicht).

## 5. Fehler- und Meldungsabbildung

| S/4-Ergebnis | CAP-Antwort (03 §5) |
|---|---|
| Schritt im Status nicht erlaubt | 400 `STEP_NOT_ALLOWED` |
| Pflichtparameter fehlt / zu lang | 400 `ASSERT_MANDATORY` (prüft CAP schon vor dem Aufruf; meldet S/4 es trotzdem: `INPUT_REQUIRED`) / `INPUT_TOO_LONG`, `target` = Parameter |
| BP unbekannt / ohne Debitorrolle | 400 `BP_NOT_FOUND` / `BP_NOT_CUSTOMER` (R-06) |
| Rückfrage (fremde Magento-Company) | 412 `CONFIRM_REQUIRED` + `Preference-Applied: handling=strict`, Frage in `details[0]` |
| Harter Abbruch (`ev_error = 'A'`) | 422 `STEP_ABORTED`, Meldung im Protokoll **und** in der Antwort (R-04) |
| Fachlicher Fehler mit Fehlerstatus (140/150/160) | 200 mit Warnungen in `sap-messages` |
| Version veraltet | 412 `ETAG_REQUIRED` |
| Keine Berechtigung (VKORG, Rolle) | 403 |

Meldungen liefert S/4 mit Typ, Klasse/Nummer und Text in der Sprache des Benutzers; die Fassade übernimmt sie ins Protokoll der Replik.

## 6. B-02: Popups der Schrittklassen → Parameter

| Popup im Altsystem | Ersatz | Schritte |
|---|---|---|
| `ZEC_CUST_POPUP_DECLINE` (Ablehnungsgrund) | Parameter `Text` (Pflicht, ≤ 100 Zeichen, Original-Schreibweise, R-14) | REJECT |
| `POPUP_GET_VALUES*` (Klärungskommentar) | Parameter `Text` (Pflicht, ≤ 100 Zeichen) | CLARIFY |
| `POPUP_GET_VALUES*` (Geschäftspartner) | Parameter `BusinessPartner` (Pflicht) | CHNG_OLD, CNG_DEBI |
| `POPUP_TO_CONFIRM` (Rückfrage) | Parameter `Force`; ohne `Force` liefert S/4 die Frage als Meldung `CONFIRM_REQUIRED` zurück | CHNG_OLD, CNG_DEBI (zu prüfen: weitere Schritte mit Bestätigung) |

Umsetzung: `ZIF_EC_CUSTOMER` um eine Eingabestruktur (`TEXT`, `BUSINESS_PARTNER`, `FORCE`) erweitern; die Schrittklassen lesen daraus statt Popups aufzurufen. Zu prüfen: vollständige Liste der Popup-Aufrufe je Schrittklasse (Where-used auf die drei Bausteine).

## 7. Mit der Schnittstelle zu behebende Altsystem-Befunde (07)

R-01 (Serialisierung + Version), R-02 (Freigabe nach Prozessartwechsel neu prüfen), R-03/R-04 (Notification nach Commit, Ergebnis protokollieren), R-05 (adressgenaue Ablehnung), R-06 (BP ohne Debitorrolle ablehnen, Rückfrage für beide Zuordnungsschritte), R-07 (Währung im Freigabelimit), R-09–R-11 (Teilergebnisse, kein Dump, idempotente WE-Anlage), R-16 (Subscription-Namen nicht umbenennen).

## 8. Nächste Schritte

1. E-07 entscheiden (§1) und S/4-Release bestätigen.
2. „Zu prüfen“-Punkte im System klären: Format `PAYLOAD_CHNG`, Protokollablage, Popup-Aufrufe, Magento-Company am BP.
3. S/4-Service bauen (B-02, B-03), EDMX bereitstellen.
4. CAP: `cds import` des EDMX, S/4-Adapter in `srv/backend/` registrieren (`registerBackend("s4", …)`, `cds.requires.backend.kind = "s4"`), Delta-Sync und Replik (B-06), Destination + Cloud Connector + Principal Propagation (B-04).
