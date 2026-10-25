# 08 – Demo-Drehbuch (Phase 1, CAP-Mock, Fiori Elements)

Start: `cds watch` → http://localhost:4004/monitor/index.html. Daten liegen im Speicher; **Neustart von `cds watch` setzt alles zurück** (vor jeder Demo neu starten, auch Entwürfe sind dann weg).

| Benutzer | Passwort | Rollen | VKORG | sieht |
|---|---|---|---|---|
| `alice` | `alice` | Viewer, Editor, Releaser | 0001, 2000, 7050 | alle 26 Vorgänge |
| `bob` | `bob` | Viewer | 0001 | 17 Vorgänge (nur 0001, nur freigegebene), kein Bearbeiten, keine Schritte |
| `carol` | `carol` | Viewer, Editor | 0001, 2000, 7050 | wie alice ohne Freigeben – für Sperr-Demos (zweites privates Fenster) |

Vorgänge sind über die Suche (Name) schnell auffindbar. Nummer = Testdatensatz aus [03 §7](03_service_vertrag.md#7-mock-verhalten-phase-1).

## 1. Liste und Filter (F-16)

1. Start: Statusgruppe „Offen“ + „Fehler“ vorbelegt → 18 Vorgänge, älteste zuerst; Zeilen mit Bestellung blau markiert, Hinweis-Icons (Schloss = nicht freigegeben, ? = in Klärung, Wagen = Bestellung).
2. Prozessart „Neuer Warenempfänger“ → **Start** → 3 Vorgänge.
3. Statusgruppe leeren → **Start** → 26 Vorgänge; Statusgruppe „Abgelehnt“ → #11, #19 (nach Ablehnen), …
4. „Freigegeben = Nein“ → #2, #8, #18, #19 (alle VKORG 7050). „In Klärung = Ja“ → #13, #18.
5. Sortieren über die Tabelleneinstellungen (Zahnrad) oder den Spaltenkopf (z. B. Bestellvolumen absteigend → #18 Svensk Hydraulteknik, 25.000 EUR); Spalten ein-/ausblenden ebenfalls dort.
6. „Filter anpassen“ zeigt die weiteren Felder (Erstellt/Geändert von/am, Quelle, Bestellung vorhanden).

## 2. Detail (F-17)

| Zeigen | Vorgang |
|---|---|
| Warenempfänger-Abschnitt statt Ansprechpartner | #20 Vogel Antriebe (CR_WE, „Adresse in Auftrag verwendet: Ja“) |
| Klärungs-Hinweis im Kopf | #13 Wagner Steuerungstechnik |
| „Nicht freigegeben“ (orange) | #18 Svensk Hydraulteknik |
| Protokoll mit Feldänderungen (Reiter „Protokoll“) | #16 Roth Fluidtechnik |
| Fehlerstatus (rot) | #3, #7, #9, #17 |
| Deep-Link / Vollbild / Schließen | URL eines Details kopieren und in neuem Tab öffnen; alter Link `#/requests/<uuid>` funktioniert weiter |

## 3. Bearbeiten (F-19, Draft)

1. #6 Bauer Filtertechnik → **Bearbeiten** → Name 2 und Vorname (Reiter „Ansprechpartner“) ändern → **Sichern** → Toast, je Feld ein Protokolleintrag.
2. Sperre: #6 als `alice` bearbeiten (nicht sichern); als `carol` im zweiten Fenster #6 öffnen → **Bearbeiten** nicht möglich („wird bereits von alice bearbeitet“), Schritte inaktiv.
3. Zeilenwechsel während der Bearbeitung: nichts geht verloren – der Entwurf bleibt (Filter „Bearbeitungsstatus: Eigene Entwürfe“ zeigt ihn), beim nächsten Öffnen geht es im Bearbeitungsmodus weiter; **Abbrechen** verwirft ihn nach Rückfrage.
4. Abgeschlossene Vorgänge (z. B. #12) zeigen kein **Bearbeiten**.

## 4. Schritte (F-18)

Menü **Schritt ausführen** im Kopf; inaktive Einträge = vom Backend nicht erlaubt.

| Schritt (Menüeintrag) | Vorgang | Erwartung |
|---|---|---|
| Debitor und Admin anlegen | #14 Hartmann Pneumatik | Bestätigung → neue Debitor-/GP-/AP-Nummern, Status „Erledigt“, Toast |
| Debitor und Admin anlegen (Fehler) | #3 FEHLER Test Maschinenbau | Meldungsdialog (Warnung), Status bleibt „Fehler Anlage Neukunde“ |
| Dublette – Debitor zuordnen | #1 Müller Hydraulik, GP `1000030` | Parameterdialog → „Dublette – Debitor zugeordnet“, Prozessart → Bestehender Debitor |
| Zuordnung zu Debitor ändern mit Rückfrage | #26 Albrecht Filtersysteme, GP `1000002` | Rückfrage „bereits Magento-Company 999 zugeordnet“ (Strict Handling) → Bestätigen → Status 110 |
| Zuordnung zu Debitor ändern ohne Debitorrolle | #26, GP `1000031` | Fehler „hat keine Debitorrolle“ am Dialogfeld |
| Umwandeln in Neukunde | #5 Fluidtec | Prozessart „Neuer Debitor“, Freigabe neu geprüft → **nicht freigegeben** (R-02), Warnung im Dialog |
| Ansprechpartner anlegen/ändern | #6 Bauer Filtertechnik | Ansprechpartner angelegt, Status „Erledigt“ |
| Ansprechpartner anlegen/ändern (Abbruch) | #4 Schmidt Antriebstechnik (VKORG 2000, keine CRM-Nr.) | Fehler „Schritt abgebrochen“, Eintrag im Protokoll |
| Ansprechpartner anlegen/ändern (Fehlerstatus) | #17 Busch Kompressoren | Warnung, Status „Fehler Modify Ansprechpartner“ |
| Warenempfänger anlegen | #20 Vogel Antriebe | Warenempfänger angelegt, Status „Erledigt“ |
| Freigeben | #18 Svensk Hydraulteknik | „Freigegeben (manuell)“, danach normale Schritte |
| In Klärung | #1 Müller Hydraulik | Kommentar Pflicht (max. 100), Hinweis im Kopf |
| Anfrage ablehnen | #19 Göteborg Maskin | Begründung Pflicht, Status „Abgelehnt“ (Vorgang verschwindet aus der Standardliste) |
| Manuell erledigen | #15 Lindner Automation | Status „Manuell erledigt“ |
| Erneut bearbeiten | #11 (CR_DEB ohne Debitor → 120), #21 (CR_WE → 010), #23 / #24 (→ Bestehender Debitor / 000) | Bestätigung, dann neuer Status |

Destruktive Schritte (Ablehnen, Erneut bearbeiten) stehen im Menü zuletzt. Busy-Zustände sichtbarer machen: `MOCK_LATENCY_MS=1500 cds watch`.

## 5. Berechtigungen

Als `bob` anmelden (privates Fenster): nur VKORG 0001 und freigegebene Vorgänge, kein **Bearbeiten**, im Menü **Schritt ausführen** sind alle Einträge inaktiv.

## 6. Meldungen und Fehler

- Nach Schritten: Toast (Erfolg) bzw. Meldungsdialog (Warnungen/Fehler); beim Bearbeiten gebundene Meldungen im Meldungs-Button des Fußbereichs.
- Konflikt: #1 in zwei Fenstern öffnen, in Fenster 1 einen Schritt ausführen, in Fenster 2 ohne **Aktualisieren** einen Schritt starten → Fehlerdialog „zwischenzeitlich geändert“ → **Aktualisieren**.
- `cds watch` stoppen und **Aktualisieren** klicken → FE-Fehlerdialog statt Absturz.
