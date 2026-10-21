# 01 – Fachkonzept (Ist-Logik des Kundenmonitors)

Quelle: Code-Analyse des SAP-GUI-Monitors (Stand 19.10.2026) und Customizing-Tabellen `ZEC_CUST_*` im System. Ausführliche Fassung mit Diagrammen: Confluence EXTHYDAC › Australien › *Kundenmonitor (ZEC_CUSTOMER_MONITOR)*.

Dieses Dokument beschreibt **was** der Monitor fachlich tut. Die BTP-Lösung übernimmt diese Logik unverändert, außer dort, wo [07_anforderungen_aus_altsystem.md](07_anforderungen_aus_altsystem.md) eine Änderung fordert.

---

## 1. Zweck

Magento sendet Registrierungen von Firmen, neue Shop-Benutzer und neue Lieferadressen an S/4HANA (`ZEC_CUSTOMER_CREATE_SRV`). S/4 legt daraus **keine Stammdaten direkt** an, sondern einen **Vorgang** (Tabelle `ZEC_CUSTOMER`). Der Innendienst prüft und vervollständigt den Vorgang im Monitor und löst über **Schritte** die Anlage bzw. Zuordnung von Geschäftspartner, Debitor, Ansprechpartner oder Warenempfänger aus. Ergebnisse werden per OData-Notification an Magento gemeldet.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| Vorgang (Request) | Ein Eintrag aus Magento, Schlüssel GUID |
| Prozessart | Art des Vorgangs (`CR_DEB`, `CH_DEB`, `CR_AP`, `CH_AP`, `CR_WE`) |
| Status | Bearbeitungsstand (3-stellig, siehe §5) |
| Schritt (Step) | Bearbeitungsaktion; je Schritt eine ABAP-Klasse |
| Freigabe (Release) | Vorgang darf erst nach Freigabe bearbeitet werden (abhängig von Regeln, §4) |
| Klärung (Clarification) | Kennzeichen + Kommentar, Status bleibt unverändert |
| Admin | Erster Ansprechpartner des Vorgangs (Shop-Benutzer), Webshop-Rolle `PARH4` |
| Magento-Company / -Customer / -Address | IDs aus Magento; Mapping zu Debitor / Ansprechpartner / Warenempfänger |
| Quelle (Source) | Herkunftssystem, derzeit nur `SHOP` |

## 3. Prozessarten und Eingang

| Prozessart | Bedeutung | Startstatus | Typischer Abschluss |
|---|---|---|---|
| `CR_DEB` | Neues Unternehmen ohne SAP-Debitor | 000 | CREATE → 999 |
| `CH_DEB` | Unternehmen mit bestehendem Debitor | 000 | AP_MODIFY → 999 |
| `CR_AP` | Neuer Shop-Benutzer (Ansprechpartner) zu bestehendem Debitor | 000 | AP_MODIFY → 999 |
| `CH_AP` | Änderung bestehender Ansprechpartner | 997 (automatisch) | – |
| `CR_WE` | Neue Lieferadresse (Warenempfänger) zu bestehendem Debitor | 010 | CREATE_WE → 999 |

Ermittlung beim Eingang (in dieser Reihenfolge):

1. Keine Debitornummer → `CR_DEB`, sonst `CH_DEB`.
2. Debitornummer vorhanden **und** Admin-Webshop-Rolle `PARH4 ≠ '01'` → `CR_AP` (ohne Ansprechpartnernummer) bzw. `CH_AP` (mit Ansprechpartnernummer). `PARH4` leer wird auf `'01'` gesetzt.
3. Lieferadressdaten vorhanden → `CR_WE` (überschreibt 1 und 2). Verkaufsorganisation und bestehender Debitor sind Pflicht; Name/Adresse werden aus dem Debitor nachgelesen.

Weitere Eingangsverarbeitung:

- Payload wird unverändert (`PAYLOAD_ORIG`) und als Arbeitskopie (`PAYLOAD_CHNG`) gespeichert.
- `CR_DEB`: Defaultwerte aus `ZEC_CUST_DEFAULT` je Quelle + VKORG (nur leere Felder).
- VKORG 2000 (nicht `CR_DEB`): Verkäufergruppe aus KNVV.
- `CH_AP`: Ansprechpartner wird sofort geändert → Status 997.
- Bestellvolumen, Währung, Kennzeichen „Bestellung vorhanden“ und Kreditkarte werden gespeichert.
- Freigabeprüfung (§4), Protokolleinträge.

## 4. Freigabe

Schlüssel `ZEC_CUST_APPROV`: Prozessart + Quelle + VKORG. Auswertung:

| Bedingung | Ergebnis | RELPROC |
|---|---|---|
| Prozessart `CH_AP` | freigegeben | `NOT_REL` |
| kein Eintrag | **nicht** freigegeben | – |
| `NOT_REQ = X` | freigegeben | `NOT_REL` |
| (`CREDITCARD = X` und Kreditkarten-Kennzeichen im Payload) oder (0 < Bestellvolumen ≤ `LIMIT`) | freigegeben | `AUTOMATIC` |
| sonst | **nicht** freigegeben | – |

Manuelle Freigabe im Monitor setzt `RELPROC = MANUAL` + Benutzer/Zeit.

Aktuelles Customizing (Quelle SHOP; „–“ = keine Freigabe nötig):

| VKORG | CR_DEB | CH_DEB | CR_AP | CR_WE |
|---|---|---|---|---|
| 0001 | auto bei Kreditkarte oder Volumen ≤ 5.000 EUR, sonst manuell | – | – | – |
| 2000 | – | – | – | – |
| 7020 | manuell (kein Eintrag) | – | – | – |
| 7050 | manuell | – | manuell | manuell |
| 7060 | – | – | – | – |
| 7080 | manuell | – | – | – |
| 7110 | manuell | – | – | – |

Nicht freigegebene Vorgänge sind nur mit Sonderberechtigung sichtbar (Alt: `ZEC_MONITO` ACTVT 43) und bieten nur **Freigeben** und **Ablehnen**.

## 5. Status

| Status | Text DE | Bedeutung | UI-Zustand |
|---|---|---|---|
| 000 | Neu | Eingang CR_DEB/CH_DEB/CR_AP | offen |
| 010 | Warenempfänger neu | Eingang CR_WE | offen |
| 110 | Zuordnung zu Debitor geändert | nach CNG_DEBI | offen |
| 120 | Umgewandelt in Neukunde | nach CNG_NEW | offen |
| 130 | Dublette – Debitor zugeordnet | nach CHNG_OLD | offen |
| 140 | Fehler Modify Ansprechpartner | AP_MODIFY fehlgeschlagen | Fehler |
| 150 | Fehler Anlage Neukunde | CREATE fehlgeschlagen | Fehler |
| 160 | Fehler Anlage Warenempfänger | CREATE_WE fehlgeschlagen | Fehler |
| 899 | Abgelehnt | nach REJECT | abgeschlossen |
| 997 | Automatisch erledigt | CH_AP beim Eingang | abgeschlossen |
| 998 | Manuell erledigt | nach MANUAL_OK | abgeschlossen |
| 999 | Erledigt | erfolgreicher Abschluss | abgeschlossen |

Statusgruppen: `0xx/1xx` offen (1x0 Fehlerstatus 140/150/160), `8xx` abgelehnt, `9xx` erledigt.
Texte gepflegt in DE, EN, FR, IT (`ZEC_CUST_STATUST`).

## 6. Schritte

### 6.1 Schrittdefinition (`ZEC_CUST_STEPS`)

| Schritt | Text DE | Erfolg → | Fehler → | Eingabe im Dialog |
|---|---|---|---|---|
| `AP_MODIFY` | Ansprechpartner anlegen/ändern | 999 | 140 | – |
| `CHNG_OLD` | Dublette – Debitor zuordnen | 130 | – | Geschäftspartnernummer |
| `CNG_DEBI` | Zuordnung zu Debitor ändern | 110 | – | Geschäftspartnernummer (+ ggf. Rückfrage) |
| `CNG_NEW` | Umwandeln in Neukunde | 120 | – | Bestätigung |
| `CREATE` | Debitor und Admin anlegen | 999 | 150 | – |
| `CREATE_WE` | Warenempfänger anlegen | 999 | 160 | – |
| `MANUAL_OK` | Manuell erledigt | 998 | – | Bestätigung |
| `REJECT` | Anfrage ablehnen | 899 | – | Ablehnungsgrund (Pflicht, max. 100 Zeichen) |

„Fehler → –“: Bei Fehler/Abbruch keine Statusänderung.
Schritttexte gepflegt in DE, EN, FR, IT, NL, SV (`ZEC_CUST_STEPST`).

### 6.2 Zulässige Schritte je Prozessart und Status (`ZEC_CUST_PROCESS`, Quelle SHOP)

| Prozessart | Status | Schritte |
|---|---|---|
| CR_DEB | 000, 120 | CREATE, CHNG_OLD, MANUAL_OK, REJECT |
| CR_DEB | 150 | CREATE, MANUAL_OK, REJECT |
| CH_DEB | 000, 110, 130 | AP_MODIFY, CNG_DEBI, CNG_NEW, MANUAL_OK, REJECT |
| CH_DEB | 140 | AP_MODIFY, MANUAL_OK, REJECT |
| CR_AP | 000, 140 | AP_MODIFY, MANUAL_OK |
| CR_WE | 010, 160 | CREATE_WE, MANUAL_OK |

### 6.3 Fest programmierte Funktionen

Werden zusätzlich zu 6.2 angeboten (Reihenfolge der Prüfung):

| Funktion | Angeboten wenn | Wirkung |
|---|---|---|
| `RESET` – Erneut bearbeiten | Status 8xx/9xx (dann **nur** RESET) | Mappings löschen; `CR_DEB` → `CH_DEB`/000; `CR_WE` → 010; sonst 000. Sonderfall: abgelehnter `CR_DEB` ohne Debitor → `CR_DEB`/120 |
| `RELEASE` – Freigeben | nicht freigegeben (dann **nur** RELEASE + REJECT) | Bestätigung; freigegeben mit `RELPROC = MANUAL` |
| `CLARIFY` – In Klärung | Status 000 und noch nicht in Klärung | Pflichtkommentar; Kennzeichen setzen; Status bleibt |

### 6.4 Verarbeitung je Schritt

| Schritt | Verarbeitung (S/4) | Notification an Magento |
|---|---|---|
| CREATE | Ohne Debitor/BP: BP + Debitor anlegen (CMD-API), Mapping Magento-Company. BP ohne Debitor: Debitorrolle ergänzen. Danach Admin-Ansprechpartner anlegen bzw. ändern. VKORG 7110: zusätzlich Spediteur (`create_carrier`). | Kunde |
| AP_MODIFY | VKORG 2000: CRM-Nummer am Debitor Pflicht (sonst Abbruch, Meldung 058). Ansprechpartner ohne Nummer → anlegen, sonst ändern. | Kunde |
| CREATE_WE | Warenempfänger anlegen (oder gespeicherte WE-Nummer wiederverwenden), dem Auftraggeber zuordnen, Mapping Magento-Address. | Kunde (Auftraggeber) |
| CHNG_OLD | BP-Nummer erfassen → Debitor ermitteln → Prozessart `CH_DEB`. | – |
| CNG_DEBI | BP-Nummer erfassen; Rückfrage, wenn Debitor bereits einer anderen Magento-Company zugeordnet; Prozessart `CH_DEB`; Ansprechpartnernummer zurücksetzen. | – |
| CNG_NEW | Debitor, BP, Ansprechpartnernummer leeren; Prozessart `CR_DEB`; Defaultwerte setzen. | – |
| MANUAL_OK | nur Statuswechsel. | – |
| REJECT | Ablehnungsgrund erfassen. | Ablehnung (Company, Customer, Grund) |

**Prozessartwechsel:** CHNG_OLD und CNG_DEBI → `CH_DEB`, CNG_NEW → `CR_DEB`. Danach gelten die Schritte der neuen Prozessart.

### 6.5 Ergebnis eines Schritts

| Ergebnis | Wirkung |
|---|---|
| Erfolg | Status = Erfolgsstatus, Protokoll, Speichern |
| Fehler | Status = Fehlerstatus (falls definiert), Protokoll, Speichern; sonst unverändert |
| Abbruch (Benutzer oder harte Vorbedingung) | keine Änderung |

## 7. Bearbeitung der Daten

- Bearbeitbar: Hauptdaten, Admin/Ansprechpartner, Vertriebsdaten, Warenempfänger (nur `CR_WE`).
- Speichern protokolliert jede Feldänderung (Feld, alter Wert, neuer Wert).
- Admin-Block nicht bei `CR_WE`, Warenempfänger-Block nur bei `CR_WE`.

## 8. Protokoll

Je Vorgang fortlaufende Einträge: Meldungstyp, Nachrichtenklasse/-nummer, Variablen, Schritt, Benutzer, Zeitpunkt.
Typische Einträge: Eingang (006; 008 bei CR_DEB; 048 bei CH_AP), Freigabeergebnis (027/028/029), Schrittmeldungen, Feldänderungen, Freigabe (030), Klärung (052), Reset (039).

## 9. Notifications an Magento

| Auslöser | Ziel | Inhalt |
|---|---|---|
| CREATE, CREATE_WE, AP_MODIFY erfolgreich | `ZEC_CUSTOMER_READ_SRV` / `ZEC_CUSTOMER_MAIN` | Debitornummer (ID-Notification; Magento liest danach nach) |
| REJECT | `ZEC_CUSTOMER_CREATE_SRV` / `RejectCusomterSet` (Schreibweise ist Vertragsbestandteil) | Magento-Company, Magento-Customer, Grund |
| Debitorpflege mit Partnerrolle ZO (BAdI) | wie Kunde | Debitornummer |

Notifications bleiben in Phase 1–2 Aufgabe von S/4. Die BTP-Lösung löst sie **nicht** selbst aus.

## 10. Berechtigungen (Alt)

| Prüfung | Objekt |
|---|---|
| Selektion | `V_KNA1_VKO` je VKORG |
| Liste | `V_VBAK_VKO` je Vorgang |
| Nicht freigegebene Vorgänge sehen | `ZEC_MONITO` ACTVT 43 |

Ziel-Berechtigungskonzept: [02_architektur.md](02_architektur.md#berechtigungen).
