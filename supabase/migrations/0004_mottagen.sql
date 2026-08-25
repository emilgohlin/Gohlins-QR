-- Ny status: "mottagen".
--
-- BAKGRUND: statusarna skrevs när mejlet var enda vägen in till Göhlins. Då
-- var en order som inte gick att mejla verkligen misslyckad. Nu finns
-- adminvyn, och en order som ligger där ÄR framme — innesälj ser den, lägger in
-- den i affärssystemet och kvitterar. Att kalla den misslyckad är fel mot
-- kunden, som får ett rött besked om något som fungerat.
--
--   utkast      sparad men inte skickad av kunden
--   mottagen    framme hos Göhlins, syns i adminvyn, väntar på hantering
--   skickad     dessutom mejlad till innesälj
--   misslyckad  mejlet försöktes och gick inte fram – ett riktigt fel
--
-- Att villkoret måste tas bort och sättas om är oundvikligt; ett check-villkor
-- går inte att utöka på plats. Ingen data rörs av det.

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders add constraint orders_status_check
  check (status in ('utkast', 'mottagen', 'skickad', 'misslyckad'));

-- Ordrar som bara väntade på ett mejlutskick som inte var påslaget var aldrig
-- misslyckade. De var mottagna.
update public.orders
   set status = 'mottagen'
 where status = 'misslyckad'
   and error like '%inte konfigurerat%';
