-- Adminvy: personalkonton, och spår av vilka ordrar som är omhändertagna.
--
-- VARFÖR ETT EGET KONTOSLAG och inte en flagga på customer_accounts:
-- kundkontona är kundernas, och en boolean i samma tabell är en rad från att
-- någon råkar sätta den på fel konto. Då ser en kund alla andra kunders ordrar.
-- Två tabeller kan inte förväxlas.
--
-- Personalen loggar in på samma sätt som kunderna – namn och kod, scrypt-hash,
-- lås efter upprepade fel – men koden ska vara betydligt längre. Ett kundkonto
-- ser sina egna ordrar; det här kontot ser allas.
--
-- Kör i Supabase SQL editor.

create table if not exists public.staff_accounts (
  id            uuid primary key default gen_random_uuid(),
  -- Det man loggar in med: namnet nedsantat och utan blanksteg.
  login_name    text not null unique,
  -- Namnet som visas, och som skrivs på ordrar den här personen tagit hand om.
  name          text not null,
  pin_hash      text not null,
  pin_salt      text not null,
  active        boolean not null default true,
  failed_count  integer not null default 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.staff_accounts enable row level security;

comment on table public.staff_accounts is
  'Personalens inloggningar till adminvyn. RLS utan policy – åtkomst endast via servern med service-nyckeln.';

-- ─────────────────────────────────────────────────────────────
-- Omhändertagna ordrar
-- ─────────────────────────────────────────────────────────────
-- Utan det här är listan bara en hög. Med det går det att se vad som redan är
-- inlagt i affärssystemet, och två personer lägger inte in samma order två
-- gånger.
alter table public.orders add column if not exists handled_at timestamptz;
alter table public.orders add column if not exists handled_by text;

-- Adminvyn frågar i praktiken alltid "vad är inte hanterat än".
create index if not exists orders_handled_idx on public.orders (handled_at);
