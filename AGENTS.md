# Göhlins Kundorder

Kunderna beställer själva: loggar in, skannar QR-koden på hyllkanten, väljer
antal och skickar. Ordern går ut som **mejl med PDF och XML** — inget
affärssystem är inkopplat i första skedet.

## Detta är INTE den Next.js du känner

Versionen är 16 och har brytande ändringar mot äldre kunskap: `middleware.ts`
heter `proxy.ts` och exporten `proxy`, Turbopack är standard, `next lint` är
borta (använd `eslint`). Läs `node_modules/next/dist/docs/` innan du skriver kod,
särskilt `01-app/02-guides/upgrading/version-16.md`.

## Säkerhetsmodellen — läs innan du rör datalagret

Det här är en **kundvänd** app. Den delar avsiktligt INGENTING med den interna
appen the-brain, som använder ett gemensamt konto och har `using (true)` på varje
tabell. En kund i det projektet hade sett allt.

Två regler följer av det:

1. **Webbläsaren pratar aldrig med Supabase.** Ingen anon-nyckel skickas till
   klienten. All datatrafik går via egna route handlers i `src/app/api/` som
   använder service-nyckeln på servern.
2. **RLS är på och tabellerna har inga policyer.** Det betyder att varken anon-
   eller authenticated-nyckeln kommer åt något. Skyddet ligger alltså inte i en
   policy man kan råka skriva fel, utan i att nyckeln aldrig lämnar servern.

Inloggningen är företagsnamn + PIN. PIN-koden lagras som scrypt-hash med salt,
aldrig i klartext, och kontot låses en stund efter upprepade felaktiga försök —
ett företagsnamn är gissningsbart, så det är försöken som måste kosta.

## Ordern måste kunna läsas av the-brain

XML:en skrivs i Monitor ERP:s **ORDERS420**, samma format som orderinläsningen i
the-brain redan läser (`src/lib/order/parseOrder.ts` där). Det är avsiktligt: när
affärssystemskopplingen kommer byter vi transportväg, inte format.

`test/orders420.test.ts` kör vår XML genom the-brains riktiga parser. Ändra
aldrig generatorn utan att testet går igenom.

## Konventioner

Kommentarer och gränssnitt på svenska. Kommentera *varför*, inte vad.
Migrationer numreras och skrivs om aldrig i efterhand — de är ett historiskt
protokoll. Undvik `drop`: Supabases SQL-editor flaggar det som destruktivt.
