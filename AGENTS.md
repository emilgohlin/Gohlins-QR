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

Sedan finns **adminvyn** på `/admin`, där innesälj ser alla kunders ordrar.
Den har ett eget kontoslag i en egen tabell (`staff_accounts`) och en egen
sessionskaka. Att rollen inte är en flagga på kundkontot är hela poängen: en
boolean i samma tabell är en rad från att någon sätter den på fel konto, och då
ser en kund alla andra kunders ordrar. Två tabeller kan inte förväxlas.
Personalens kod är minst 12 tecken — kundens fyrsiffriga PIN duger för ett konto
som ser sina egna ordrar, inte för ett som ser allas.

Inloggningen är företagsnamn + PIN. PIN-koden lagras som scrypt-hash med salt,
aldrig i klartext, och kontot låses en stund efter upprepade felaktiga försök —
ett företagsnamn är gissningsbart, så det är försöken som måste kosta.

## Ordern måste kunna läsas av the-brain

XML:en skrivs i Monitor ERP:s **ORDERS420**, samma format som orderinläsningen i
the-brain redan läser (`src/lib/order/parseOrder.ts` där). Det är avsiktligt: när
affärssystemskopplingen kommer byter vi transportväg, inte format.

`test/orders420.test.ts` kör vår XML genom the-brains riktiga parser. Ändra
aldrig generatorn utan att testet går igenom.

## Innan du pushar

`npm run kontroll` — typkontroll, lint och tester. `npm test` ensamt räcker
inte: tsx strippar typerna utan att kontrollera dem, så ett test som använder
ett fält som inte finns går igenom lokalt och fäller bygget i stället.

Bygget typkontrollerar även `test/`. Ingenting där får referera utanför repot:
en relativ import till the-brain gör att appen inte går att bygga på en
maskin där grannprojektet saknas.

## Konventioner

Kommentarer och gränssnitt på svenska. Kommentera *varför*, inte vad.
Migrationer numreras och skrivs om aldrig i efterhand — de är ett historiskt
protokoll. Undvik `drop`: Supabases SQL-editor flaggar det som destruktivt.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
