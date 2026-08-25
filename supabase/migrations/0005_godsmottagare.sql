-- Godsmottagare per kund, och en anteckning innesälj ska se.
--
-- Akwel har tre adresser i Monitor och ordern måste peka ut vilken. Utan det
-- hamnar godset hos rätt företag men fel ort, och en kund som beställer till
-- Varberg får leveransen i Ulricehamn.
--
-- Mottagarna ligger i en EGEN TABELL och inte som fritext på ordern: de är ett
-- register som ändras sällan och ska väljas ur, inte skrivas. Ett fritextfält
-- hade gett "Varberg", "VARBERG" och "varberg " som tre olika adresser.
--
-- Kör i Supabase SQL editor.

create table if not exists public.delivery_recipients (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts (id) on delete cascade,
  -- Mot.nr i Monitor. Det är den kod affärssystemet känner igen adressen på.
  code       text not null,
  name       text not null,
  street     text not null default '',
  zip_city   text not null default '',
  active     boolean not null default true,
  -- Ordningen i rullgardinen. Den vanligaste adressen ska ligga överst.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (account_id, code)
);

create index if not exists delivery_recipients_account_idx
  on public.delivery_recipients (account_id, sort_order);

alter table public.delivery_recipients enable row level security;

comment on table public.delivery_recipients is
  'Kundens godsmottagare (Mot.nr i Monitor). RLS utan policy – åtkomst endast via servern.';

-- ─────────────────────────────────────────────────────────────
-- Vald mottagare på ordern
-- ─────────────────────────────────────────────────────────────
-- KOPIERAS hit vid beställning, precis som benämningen på orderraden.
-- Registret ändras över tiden, och ordern ska visa vad kunden valde när hen
-- beställde – inte vad adressen heter i dag.
alter table public.orders add column if not exists recipient_code text;
alter table public.orders add column if not exists recipient_name text;
alter table public.orders add column if not exists recipient_address text;

-- ─────────────────────────────────────────────────────────────
-- Anteckning om kunden
-- ─────────────────────────────────────────────────────────────
-- Sådant innesälj måste veta varje gång kunden beställer: "alla QR-ordrar ska
-- offereras till …". Visas på varje order i adminvyn, för en anteckning ingen
-- ser är ingen anteckning.
alter table public.customer_accounts add column if not exists note text;
