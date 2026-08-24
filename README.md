# Göhlins Kundorder

Kundernas egen beställningsapp. Logga in med företagsnamn och PIN, skanna
QR-koden på hyllkanten, välj antal, skicka. Ordern mejlas som PDF och XML.

## Kom igång

1. `npm install`
2. Skapa ett **eget** Supabase-projekt (inte samma som the-brain — se AGENTS.md).
3. Kör `supabase/migrations/0001_init.sql` i SQL-editorn.
4. Kopiera `.env.example` till `.env.local` och fyll i.
5. `npm run dev`

## Test

`npm test`

Ett av testerna kör vår XML genom **the-brains riktiga orderparser**, för att
orderinläsningen ska kunna läsa filen. Projekten är i övrigt helt åtskilda, så
testet letar efter the-brain bredvid det här trädet. Ligger det någon annanstans:

    THE_BRAIN_PATH=/sökväg/till/the-brain npm test

Saknas det fallerar testet i stället för att hoppas över – ett tyst överhoppat
test hade sett grönt ut medan formatet gled isär.
