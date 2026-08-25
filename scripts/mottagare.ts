// Godsmottagare för en kund – de adresser ordern kan levereras till.
//
// Motsvarar Mot.nr i Monitor. Koden är det affärssystemet känner igen adressen
// på, så den ska skrivas av från Monitor och inte hittas på.
//
// Lägg till eller uppdatera:
//   npm run mottagare -- --kund akwel --kod 1 \
//     --namn "ULRICEHAMN Akwel Sweden AB" \
//     --gata "Hillaredsvägen 10" --postort "523 38 Ulricehamn" --ordning 1
//
// Lista kundens mottagare:
//   npm run mottagare -- --kund akwel --lista
//
// Ta bort en:
//   npm run mottagare -- --kund akwel --kod 2 --ta-bort

import { createClient } from "@supabase/supabase-js";
import { loginName } from "../src/lib/pin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function avbryt(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  const kund = arg("kund")?.trim();
  if (!kund) avbryt('Ange kunden: --kund akwel  (företagsnamnet eller inloggningsnamnet)');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) avbryt("SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY saknas.");

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: konto } = await db
    .from("customer_accounts")
    .select("id, company_name")
    .eq("login_name", loginName(kund))
    .maybeSingle();
  if (!konto) avbryt(`Hittade ingen kund som loggar in med "${loginName(kund)}".`);

  if (flag("lista")) {
    const { data } = await db
      .from("delivery_recipients")
      .select("code, name, street, zip_city, active, sort_order")
      .eq("account_id", konto.id)
      .order("sort_order");
    console.log(`\n  Godsmottagare för ${konto.company_name}:\n`);
    if (!data?.length) console.log("    (inga)");
    for (const m of data ?? []) {
      console.log(
        `    ${m.code.padEnd(14)} ${m.name}\n` +
          `    ${" ".repeat(14)} ${[m.street, m.zip_city].filter(Boolean).join(", ")}` +
          `${m.active ? "" : "   (avstängd)"}`,
      );
    }
    console.log("");
    return;
  }

  const kod = arg("kod")?.trim();
  if (!kod) avbryt("Ange mottagarens kod: --kod 1   (Mot.nr i Monitor)");

  if (flag("ta-bort")) {
    const { error } = await db
      .from("delivery_recipients")
      .delete()
      .eq("account_id", konto.id)
      .eq("code", kod);
    if (error) avbryt(`Kunde inte ta bort: ${error.message}`);
    console.log(`\n  ✓ Mottagare ${kod} borttagen från ${konto.company_name}.\n`);
    return;
  }

  const namn = arg("namn")?.trim();
  if (!namn) avbryt('Ange mottagarens namn: --namn "ULRICEHAMN Akwel Sweden AB"');

  // upsert på (account_id, code): samma kommando lägger till och rättar, så
  // en felstavad adress inte kräver att man först tar bort den.
  const { error } = await db.from("delivery_recipients").upsert(
    {
      account_id: konto.id,
      code: kod,
      name: namn,
      street: arg("gata")?.trim() ?? "",
      zip_city: arg("postort")?.trim() ?? "",
      sort_order: Number(arg("ordning") ?? 0),
      active: !flag("avaktivera"),
    },
    { onConflict: "account_id,code" },
  );
  if (error) avbryt(`Kunde inte spara: ${error.message}`);
  console.log(`\n  ✓ ${konto.company_name}: mottagare ${kod} – ${namn}\n`);
}

main();
