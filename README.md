# GVöS Miet- & Reservationsportal – Supabase v0.8

Diese Version verwendet Supabase Auth, PostgreSQL und Row Level Security.

## Inbetriebnahme

1. Datei `2026-09-03_v0.5_emergency_patch.sql` im Supabase SQL Editor ausführen.
2. Den Inhalt dieses Ordners in das GitHub-Repository `bsw_miet_tool` hochladen.
3. Mit einem in Supabase Auth angelegten und in `profiles` freigeschalteten Konto anmelden.

## Enthalten

- E-Mail-/Passwort-Anmeldung über Supabase Auth
- Rollen Kunde, Einsatzkraft und Administrator
- Mietobjekte und Verkaufsartikel aus der Datenbank
- serverseitige Mengen- und Konfliktprüfung
- Reservationen, Direktvermietungen und Selbstnutzungssperren
- globale Einsatzsperre
- Raum-/Gebäudeverbindungen
- Adminpflege von Objekten, Rollen und E-Mail-Texten
- geschütztes Erstellen, Bearbeiten und Löschen von Anmeldekonten über die Edge Function `admin-users`
- Transaktionsmails über Resend und die Edge Function `rental-email`
- Eingangsbestätigung an Kunden und neue Anfrage an `geschaeftsstelle@bielersee-suedwest.ch`
- Bestätigungsmail bei Freigabe und Rückrufmails bei einer Einsatzsperre

## E-Mail-Konfiguration

- Absender und interner Empfänger: `geschaeftsstelle@bielersee-suedwest.ch`
- Benötigtes Supabase-Secret: `RESEND_API_KEY`
- Die Versandhistorie wird in `mail_outbox` protokolliert.

Der Publishable Key im Frontend ist öffentlich verwendbar. Secret- und Service-Role-Schlüssel dürfen niemals in diese Dateien eingetragen werden.

## Mietobjekt-Details und PDFs

Die Kundenseite zeigt pro Mietobjekt eine Detailansicht mit Beschreibung, technischen Angaben und verlinkten PDF-Anleitungen. Administratoren bearbeiten diese Angaben unter **Admin → Mietobjekte → Infos & PDFs**. Pro Objekt können bis zu 10 PDF-Dateien mit maximal 20 MB je Datei verwaltet werden.

Vor dem Einsatz der Funktion muss die Migration `supabase/migrations/20261012123235_product_details.sql` auf dem verbundenen Supabase-Projekt angewendet werden. Die Detaildaten sind für angemeldete Benutzer lesbar; Änderungen und PDF-Uploads/-Löschungen sind auf Administratoren beschränkt. PDFs liegen in einem öffentlichen Bucket, damit angemeldete Nutzer die verlinkten Dateien ohne separate Sign-in-Abfrage öffnen können.
