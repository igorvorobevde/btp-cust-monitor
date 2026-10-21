# 07 – Anforderungen aus Befunden im Altsystem

Bei der Analyse des SAP-GUI-Monitors (Oktober 2026) gefundene Schwachstellen. Die Neuentwicklung darf sie **nicht** übernehmen. „Belegt“ = im Code nachgewiesen; „zu prüfen“ = Hypothese, vor Umsetzung verifizieren.

| ID | Befund im Altsystem | Anforderung an die Neuentwicklung | Schicht | Status Befund |
|---|---|---|---|---|
| R-01 | Schritte laufen ohne Sperre (Monitor öffnet im Anzeigemodus, `execute_function` prüft keine Sperre) → zwei Benutzer können parallel CREATE ausführen (doppelter BP/Debitor). | `executeStep` nur mit gültigem ETag; Backend serialisiert pro Vorgang. | CAP + S/4 | belegt |
| R-02 | CNG_NEW wandelt CH_DEB (nie freigabepflichtig) in CR_DEB um, ohne die Freigabe neu zu prüfen → Neukundenanlage ohne Freigabe in 7020/7050/7080/7110 bzw. > 5.000 EUR in 0001. | Bei Prozessartwechsel Freigabeprüfung erneut ausführen. | Mock + S/4 | belegt |
| R-03 | Notification aus BAdI `CUSTOMER_EXTENSION_CHECK` in der Prüfphase per `STARTING NEW TASK` → Magento kann vor dem Commit lesen; Mehrfach-Notifications. | Notifications erst nach Commit (z. B. bgRFC / `IN BACKGROUND TASK`), dedupliziert. | S/4 | belegt (Timing), Auswirkung zu prüfen |
| R-04 | Fehler beim Notification-Versand werden verschluckt; Log meldet trotzdem „Notification gesendet“ (047). Abbrüche mit `ev_error = 'A'` werden nicht protokolliert. | Ergebnis jeder Notification und jeder Abbruch im Log; Funktion „Notification erneut senden“ (Phase 2). | S/4 (+ UI später) | belegt |
| R-05 | REJECT bei CR_WE sendet Ablehnung mit Magento-Company + Customer, ohne Adress-ID → Magento kann nicht erkennen, dass nur eine Adresse abgelehnt wurde. | Ablehnung adressgenau (MagentoAddress) bzw. Verhalten mit TechDivision/Magento klären. | S/4 + Magento | belegt (SAP-Seite), Magento-Verhalten zu prüfen |
| R-06 | CHNG_OLD/CNG_DEBI akzeptieren BP ohne Debitorrolle (Vorgang landet als CH_DEB ohne Debitor); CHNG_OLD prüft keine bestehende Magento-Zuordnung. | `BP_NOT_CUSTOMER` ablehnen; Zuordnungsprüfung + `CONFIRM_REQUIRED` für beide Schritte. | Mock + S/4 | belegt |
| R-07 | Freigabelimit vergleicht Bestellvolumen ohne Währungsumrechnung mit dem Limit. | Umrechnung in Limit-Währung oder Abgleich nur bei gleicher Währung (Fachbereich entscheidet). | S/4 | belegt |
| R-08 | Zwei verschiedene Berechtigungsobjekte (`V_KNA1_VKO` Selektion, `V_VBAK_VKO` Liste). | Eine VKORG-Regel (CAP `@restrict` + Attribut), S/4 prüft konsistent. | CAP + S/4 | belegt |
| R-09 | CREATE bei VKORG 7110: Ergebnis der Spediteuranlage überschreibt Ansprechpartner-Meldungen; Fehler der Spediteuranlage setzen keinen Fehlerstatus. | Alle Teilergebnisse protokollieren; Teilfehler sichtbar machen. | S/4 | belegt |
| R-10 | AP_MODIFY greift ungeschützt auf `sales_data[1]` zu (Kurzdump bei CR_AP ohne Vertriebsdaten möglich). | Fehlende Daten als fachlicher Fehler, kein Dump. | S/4 | belegt |
| R-11 | CREATE_WE: Wird nach erfolgreicher WE-Anlage die Zuordnung mit ZV/031 abgebrochen, geht die neue WE-Nummer verloren → erneuter Versuch erzeugt zweiten WE. | Neue Nummern sofort persistieren; Wiederholung idempotent. | S/4 | belegt |
| R-12 | Bildschirmfelder ausgeblendeter (zugeklappter) Blöcke werden möglicherweise leer gelesen und überschreiben Daten. | Entfällt im neuen UI: PATCH sendet nur geänderte Felder. Altsystem testen. | UI | zu prüfen |
| R-13 | „Gesichert“-Meldung erscheint auch, wenn das Sichern fehlschlug. | Erfolgsmeldung nur nach erfolgreicher Antwort. | UI | belegt |
| R-14 | Ablehnungs-/Klärungstext wird über DDIC-Feld eingegeben (evtl. Großschreibung, harte 100-Zeichen-Grenze ohne Anzeige). | Freitext in Original-Schreibweise, Zeichenzähler im Dialog. | UI + S/4 | zu prüfen (Domäne von `ZEC_CUST_DEFAULT-FIELDVALUE`) |
| R-15 | Statustext 997 in EN/FR falsch („Manually Completed“), keine Statustexte NL/SV. | Texte korrigieren und vervollständigen. | Customizing | belegt |
| R-16 | Typo `RejectCusomterSet` ist Teil der Magento-Subscription. | Nicht einseitig umbenennen. | S/4 + Magento | belegt |
