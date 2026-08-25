# Göhlins Kundorder

Kundernas egen beställningsapp. Logga in med företagsnamn och PIN, skanna
QR-koden på hyllkanten, justera antalet, skicka. Ordern mejlas till innesälj med
raderna i mejlkroppen och en ORDERS420-fil som bilaga.

Artikelnummer **och benämning kommer ur QR-koden** — appen har inget
artikelregister. Det är ett medvetet första steg: utan benämning är en
felskanning osynlig för kunden, men ett register som ska hållas i synk kan vänta
tills affärssystemskopplingen finns.

## Kom igång

1. `npm install`
2. Skapa ett **eget** Supabase-projekt (inte samma som the-brain — se AGENTS.md).
3. Kör migrationerna i `supabase/migrations/` i SQL-editorn, i nummerordning.
4. Kopiera `.env.example` till `.env.local` och fyll i.
5. `npm run dev`

## Lägga upp en kund

    npm run skapa-kund -- --kundnr 12345 --namn "Ackwell" --pin 1913

Utan `--pin` slumpas en sexsiffrig kod fram och skrivs ut en gång. Skriptet
hashar koden med scrypt **innan** något lämnar datorn, och det är därför det
finns: skrivs kontot upp med SQL i Supabases editor ligger PIN-koden kvar
läsbar i frågehistoriken.

Tappas en kod bort går den inte att läsa ut — sätt en ny med `--byt-pin`.

## Adminvyn

Innesälj ser alla inkomna ordrar på `/admin`, med artikelnummer, benämning och
antal, och kan kvittera vad som är inlagt. Ordrarna syns där så fort kunden
skickar dem — mejlet är en bekvämlighet, inte vägen in.

Lägg upp ett personalkonto:

    npm run skapa-admin -- --namn "Emil"

Utan `--kod` slumpas en fram och skrivs ut en gång. Koden är minst 12 tecken:
kontot ser alla kunders ordrar.

## Mejlet

Skickas via Microsoft 365 (Graph) från postlådan i `ORDER_EMAIL_FROM`.
Appregistreringen i Entra ID behöver rättigheten **Mail.Send (application)**,
admin-godkänd. Begränsa den gärna till just avsändarpostlådan med en
application access policy i Exchange — annars får appen skicka som vem som helst
i organisationen.

## Test

`npm run kontroll` kör typkontroll, lint och tester i ett svep. **Kör den före
push.** `npm test` ensamt räcker inte: testerna körs via tsx, som strippar
typerna utan att kontrollera dem, så ett test som använder ett fält som inte
finns går igenom lokalt och fäller bygget på Vercel i stället.

Ett av testerna kör vår XML genom **the-brains riktiga orderparser**, för att
orderinläsningen ska kunna läsa filen. Projekten är i övrigt helt åtskilda, så
testet letar efter the-brain bredvid det här trädet. Ligger det någon annanstans:

    THE_BRAIN_PATH=/sökväg/till/the-brain npm test

Saknas det fallerar testet i stället för att hoppas över – ett tyst överhoppat
test hade sett grönt ut medan formatet gled isär.
