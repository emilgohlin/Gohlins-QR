-- Kundens eget märke eller ordernummer på ordern.
--
-- Kunden har ofta ett eget ordernummer eller ett märke som godset ska skyltas
-- med — "Projekt Ekhagen", "IO-4471". Utan det hamnar leveransen rätt hos
-- företaget men fel hos personen som väntar på den.
--
-- Fältet är frivilligt: alla kunder har inte något att skriva där, och ett
-- tvingande fält hade fyllts i med ett bindestreck.
--
-- Kör i Supabase SQL editor.

alter table public.orders add column if not exists marking text;

comment on column public.orders.marking is
  'Kundens eget märke/ordernummer. Går ut som GoodsLabeling/Row1 i ORDERS420.';
