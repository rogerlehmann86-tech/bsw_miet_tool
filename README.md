# GVöS Miet- & Reservationsportal – Demo v0.3

Neu in v0.3:

- neue Mietobjekte direkt im Adminbereich erfassen
- Objekte aktivieren und deaktivieren
- Räume mit Gebäuden verbinden und als Gesamtobjekt sperren
- Selbstnutzung als interne Sperre erfassen
- mehrere Kundenlogins verwalten
- geschützte Kundenseite mit Anmeldung
- Volltextsuche über Name, Kategorie und Beschreibung
- 21-Tage-Belegungskalender bei nicht verfügbaren Objekten

Neu in v0.2:

- offizielles Verbandslogo und daran angepasste Farben
- Mietpositionen im Adminbereich bearbeiten
- Vermietungen direkt erfassen und bestehende Einträge bearbeiten
- Gebäude als Gesamtobjekt mit zugeordneten Einzelräumen
- automatische Sperrlogik zwischen Gesamtgebäude und Einzelräumen

Eigenständige Testversion für den **Gemeindeverband öffentliche Sicherheit Bielersee Süd-West**.

## Enthalten

- öffentliche Miet-/Reservationsseite (`index.html`)
- lokaler Adminbereich (`admin.html`)
- Demo-Datenbank über `localStorage` – keine externe Datenbank nötig
- Preislogik gemäss bereitgestelltem Gebührenkatalog:
  - eigene Partner & Verbandsgemeinden
  - überörtliche Hilfe & Dritte (exkl. Private)
  - Positionen pro Einsatztag / Tag / 12 h
- Räume als eigene Kategorie mit **exakter Datum-/Uhrzeitbuchung**
- KP Täuffelen: Führungsraum und Aufenthaltsraum als erste Demo-Räume
- Verkaufsmaterial (Sandsäcke) getrennt von Mietobjekten
- Admin: Anfrage bestätigen, stornieren, löschen und 7-Tage-Belegung

## Wichtige Demo-Annahmen

Der Gebührenkatalog enthält keine Raumtarife. Deshalb werden Räume bewusst als **Preis auf Anfrage** geführt. Weitere Räume und deren Preise können vor der Supabase-Phase ergänzt werden.

Private sind in der zweiten Tarifspalte des Gebührenkatalogs ausdrücklich nicht enthalten. Deshalb werden private Anfragen ebenfalls **Preis auf Anfrage** geführt.

## Testen

Am einfachsten den Ordner über einen lokalen Webserver öffnen, z. B. mit VS Code Live Server oder GitHub Pages. `index.html` ist die Kundenseite, `admin.html` der Demo-Adminbereich.

Die Reservationen liegen ausschliesslich im Browser-`localStorage`. Kundenseite und Admin müssen deshalb im selben Browser und unter derselben Origin geöffnet werden.

## Nächster Schritt

Nach Freigabe der Bedienlogik:
1. definitive Räume / Ressourcen / Bestände festlegen
2. definitive Raumtarife ergänzen
3. separates Supabase-Projekt erstellen
4. Authentifizierung und RLS einrichten
5. Resend / E-Mail-Benachrichtigungen integrieren
