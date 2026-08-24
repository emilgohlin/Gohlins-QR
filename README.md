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

`npm test` — kör bland annat XML:en genom the-brains riktiga orderparser.
