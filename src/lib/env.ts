// Miljövariabler, lästa på ETT ställe.
//
// Poängen är att appen ska falla direkt och begripligt när något saknas. Utan
// den här kontrollen blir en glömd nyckel i stället ett "fetch failed" mitt i en
// kundorder, och då har kunden redan skannat sina rader.
//
// Bara serverkod får importera filen. Skulle en klientkomponent göra det blir
// bygget rött, eftersom NEXT_PUBLIC_ saknas på namnen – vilket är precis den
// varning vi vill ha: service-nyckeln får aldrig till webbläsaren.

import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Miljövariabeln ${name} saknas. Kopiera .env.example till .env.local och fyll i den.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  sessionSecret: () => required("SESSION_SECRET"),

  // Microsoft 365. Appregistreringen i Entra ID har rättigheten Mail.Send
  // (application), och avsändarpostlådan är den ordermejlen skickas SOM.
  graphTenantId: () => required("GRAPH_TENANT_ID"),
  graphClientId: () => required("GRAPH_CLIENT_ID"),
  graphClientSecret: () => required("GRAPH_CLIENT_SECRET"),
  orderEmailFrom: () => required("ORDER_EMAIL_FROM"),
  orderEmailTo: () => required("ORDER_EMAIL_TO"),
};
