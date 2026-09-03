# GVöS Miet- & Reservationsportal – Supabase v0.5

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

## Noch nicht aktiviert

- Der tatsächliche E-Mail-Versand benötigt eine Supabase Edge Function und einen Versanddienst.
- Neue Auth-Benutzer werden bis dahin unter `Authentication > Users` angelegt; Rolle und Aktivstatus können danach im Adminbereich gepflegt werden.

Der Publishable Key im Frontend ist öffentlich verwendbar. Secret- und Service-Role-Schlüssel dürfen niemals in diese Dateien eingetragen werden.
