-- Göhlins Kundorder – grundschema
--
-- SÄKERHETSMODELLEN, läs den först:
--
-- RLS slås på för varje tabell och de får AVSIKTLIGT inga policyer. Utan policy
-- kommer varken anon- eller authenticated-nyckeln åt en enda rad. All åtkomst
-- går via appens egna route handlers på servern, med service-nyckeln.
--
-- Det är skillnaden mot den interna appen the-brain, där varje tabell har
-- "using (true)" och alla inloggade ser allt. Här är användarna KUNDER, och en
-- kund får aldrig se en annan kunds ordrar. Med den här modellen ligger skyddet
-- i att nyckeln aldrig lämnar servern, inte i en policy man kan råka skriva fel.
--
-- Kör i Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────
-- Kundkonton – inloggning med företagsnamn + PIN
-- ─────────────────────────────────────────────────────────────
create table if not exists public.customer_accounts (
  id            uuid primary key default gen_random_uuid(),
  -- Kundnummer hos Göhlins. Följer med i ordern som BuyerCodeEdi och är det
  -- affärssystemet känner igen kunden på.
  kundnr        text not null unique,
  -- Företagsnamnet som det visas.
  company_name  text not null,
  -- Samma namn nedsantat och utan blanksteg: det man faktiskt loggar in med.
  -- "Axelent AB", "axelent ab" och "AxelentAB" ska vara samma konto.
  login_name    text not null unique,
  -- PIN lagras aldrig i klartext. scrypt med eget salt per konto.
  pin_hash      text not null,
  pin_salt      text not null,
  -- Mejladress för orderbekräftelse och kontakt. Inte inloggning.
  contact_email text,
  active        boolean not null default true,
  -- Ett företagsnamn är gissningsbart, så det är FÖRSÖKEN som måste kosta.
  -- Räknaren nollas vid lyckad inloggning.
  failed_count  integer not null default 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Artikelregister – kopia, för att kunden ska SE vad hen skannat
-- ─────────────────────────────────────────────────────────────
-- Utan benämning blir en felskanning osynlig ända fram till leveransen. Kopian
-- hålls i synk från the-brains register (~82 000 artiklar) tills
-- affärssystemet går att fråga direkt.
create table if not exists public.articles (
  number     text primary key,
  name       text not null default '',
  unit       text not null default 'st',
  -- Uppslagsnyckel utan ledande nollor: 26 320 artiklar heter "000000032" i
  -- registret men skrivs "32" av en människa.
  lookup_key text not null,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists articles_lookup_idx on public.articles (lookup_key);
create index if not exists articles_name_idx   on public.articles (name);

-- ─────────────────────────────────────────────────────────────
-- Ordrar
-- ─────────────────────────────────────────────────────────────
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.customer_accounts (id) on delete restrict,
  -- Vårt eget ordernummer, det kunden ser och kan hänvisa till.
  order_number  text not null unique
                default 'K-' || nextval('public.order_number_seq'),
  -- Referensen kunden fyller i. Personen som ska ha orderbekräftelsen, alltså
  -- inte frivillig – därför not null.
  reference     text not null,
  status        text not null default 'utkast'
                check (status in ('utkast', 'skickad', 'misslyckad')),
  sent_at       timestamptz,
  email_to      text,
  -- Filen som faktiskt mejlades, sparad för spårbarhet. Uppstår en tvist om vad
  -- som beställdes är det den här som gäller, inte en återskapning.
  xml           text,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists orders_account_idx on public.orders (account_id, created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

create table if not exists public.order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  -- Artikelnumret som det står i registret, med ledande nollor.
  article_number text not null,
  -- Benämning och enhet KOPIERAS hit vid beställning. Registret ändras över
  -- tiden, och ordern ska visa vad kunden såg när hen beställde.
  article_name   text not null default '',
  unit           text not null default 'st',
  quantity       numeric not null check (quantity > 0),
  -- Hela QR-koden som skannades. Blir det fel går det att se om koden var
  -- feltolkad eller om kunden skannade fel dekal.
  raw_scan       text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists order_lines_order_idx on public.order_lines (order_id, sort_order);

-- ─────────────────────────────────────────────────────────────
-- RLS: på, utan policyer. Se förklaringen högst upp.
-- ─────────────────────────────────────────────────────────────
alter table public.customer_accounts enable row level security;
alter table public.articles          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_lines       enable row level security;

comment on table public.customer_accounts is
  'Kundinloggningar. RLS utan policy – åtkomst endast via servern med service-nyckeln.';
