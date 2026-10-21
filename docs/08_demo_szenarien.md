# 08 – Demo-Drehbuch (Phase 1, CAP-Mock)

Start: `cds watch` → http://localhost:4004/monitor/index.html. Daten liegen im Speicher; **Neustart von `cds watch` setzt alles zurück** (vor jeder Demo neu starten).

| Benutzer | Passwort | Rollen | VKORG | sieht |
|---|---|---|---|---|
| `alice` | `alice` | Viewer, Editor, Releaser | 0001, 2000, 7050 | alle 26 Vorgänge |
| `bob` | `bob` | Viewer | 0001 | 17 Vorgänge (nur 0001, nur freigegebene), kein Bearbeiten, keine Schritte |

Vorgänge sind über die Suche (Name) schnell auffindbar. Nummer = Testdatensatz aus [03 §7](03_service_vertrag.md#7-mock-verhalten-phase-1).

## 1. Liste und Filter (F-04)

1. Start: 18 offene Vorgänge, älteste zuerst; Zeilen mit Bestellung blau markiert, Hinweis-Icons (Schloss = nicht freigegeben, ? = in Klärung, Wagen = Bestellung).
2. Prozessart „Neuer Warenempfänger“ → **Start** → 3 Vorgänge.
3. **Zurücksetzen**, Haken „Abgelehnte einbeziehen“ → 20; „Erledigte einbeziehen“ zusätzlich → 26.
4. „Nur nicht freigegebene“ → #2, #8, #18, #19 (alle VKORG 7050). „Nur in Klärung“ → #13, #18.
5. Sortieren über das Sortier-Icon (z. B. Bestellvolumen absteigend → #18 Svensk Hydraulteknik, 25.000 EUR).

## 2. Detail (F-05)

| Zeigen | Vorgang |
|---|---|
| Warenempfänger-Abschnitt statt Ansprechpartner | #20 Vogel Antriebe (CR_WE, „Adresse in Auftrag verwendet: Ja“) |
| Klärungs-Hinweis im Kopf | #13 Wagner Steuerungstechnik |
| „Nicht freigegeben“ (orange) | #18 Svensk Hydraulteknik |
| Protokoll mit Feldänderungen | #16 Roth Fluidtechnik |
| Fehlerstatus (rot) | #3, #7, #9, #17 |
| Deep-Link / Vollbild / Schließen | URL eines Details kopieren und in neuem Tab öffnen |

## 3. Bearbeiten (F-06)

1. #6 Bauer Filtertechnik → **Bearbeiten** → Name 2 und Vorname (Ansprechpartner) ändern → **Sichern** → Toast „Gesichert“, je Feld ein Protokolleintrag.
2. Konflikt (412): #6 in zwei Browser-Tabs öffnen, in beiden **Bearbeiten**, Tab 1 sichern, dann Tab 2 sichern → Hinweis „zwischenzeitlich geändert“, Daten neu geladen.
3. **Abbrechen** oder Klick auf eine andere Zeile mit offenen Änderungen → Rückfrage „Änderungen verwerfen?“.
4. Abgeschlossene Vorgänge (z. B. #12) zeigen kein **Bearbeiten**.

## 4. Schritte (F-07)

| Schritt | Vorgang | Erwartung |
|---|---|---|
| CREATE | #14 Hartmann Pneumatik | neue Debitor-/GP-/AP-Nummern, Status „Erledigt“ |
| CREATE (Fehler) | #3 FEHLER Test Maschinenbau | Warnung, Status bleibt „Fehler Anlage Neukunde“ |
| CHNG_OLD | #1 Müller Hydraulik, BP `1000030` | „Dublette – Debitor zugeordnet“, Prozessart → Bestehender Debitor |
| CNG_DEBI mit Rückfrage | #26 Albrecht Filtersysteme, BP `1000002` | Rückfrage „bereits Magento-Company 999 zugeordnet“ → OK → Status 110 |
| CNG_DEBI ohne Debitorrolle | #26, BP `1000031` | Fehler „hat keine Debitorrolle“ |
| CNG_NEW | #5 Fluidtec | Prozessart „Neuer Debitor“, Freigabe neu geprüft → **nicht freigegeben** (R-02) |
| AP_MODIFY | #6 Bauer Filtertechnik | Ansprechpartner angelegt, Status „Erledigt“ |
| AP_MODIFY (Abbruch) | #4 Schmidt Antriebstechnik (VKORG 2000, keine CRM-Nr.) | Fehler „Schritt abgebrochen“, Eintrag im Protokoll |
| AP_MODIFY (Fehlerstatus) | #17 Busch Kompressoren | Warnung, Status „Fehler Modify Ansprechpartner“ |
| CREATE_WE | #20 Vogel Antriebe | Warenempfänger angelegt, Status „Erledigt“ |
| RELEASE | #18 Svensk Hydraulteknik | „Freigegeben (manuell)“, danach normale Schritte |
| CLARIFY | #1 Müller Hydraulik | Text mit Zeichenzähler (max. 100), Hinweis im Kopf |
| REJECT | #19 Göteborg Maskin | Ablehnungsgrund Pflicht, Status „Abgelehnt“ (Vorgang verschwindet aus Default-Liste) |
| MANUAL_OK | #15 Lindner Automation | Status „Manuell erledigt“ |
| RESET | #11 (CR_DEB ohne Debitor → 120), #21 (CR_WE → 010), #23 / #24 (→ Bestehender Debitor / 000) | |

Schritt-Menü zeigt destruktive Schritte (Ablehnen, Erneut bearbeiten) zuletzt mit Warn-Icon. Busy-Zustände sichtbarer machen: `MOCK_LATENCY_MS=1500 cds watch`.

## 5. Berechtigungen

Als `bob` anmelden (privates Fenster): nur VKORG 0001 und freigegebene Vorgänge, kein **Bearbeiten**, Schritt-Menü „Keine Schritte verfügbar“.

## 6. Meldungen und Fehler (F-08)

- Nach Schritten: Meldungen im Popover unten (Badge mit Anzahl).
- `cds watch` stoppen und **Aktualisieren** klicken → verständliche Fehlermeldung statt Absturz.
