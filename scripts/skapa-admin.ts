// Lägger upp ett personalkonto till adminvyn.
//
// Samma skäl som skapa-kund.ts: koden hashas innan den lämnar datorn, så den
// aldrig ligger läsbar i Supabases frågehistorik.
//
// Körs med:
//   npm run skapa-admin -- --namn "Emil"
//
// Utan --kod slumpas en fram och skrivs ut en gång.
// Finns kontot redan: --byt-kod sätter en ny, --avaktivera stänger av det och
// --aktivera öppnar det igen.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { hashPin, loginName } from "../src/lib/pin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function avbryt(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/**
 * Personalkoder är LÅNGA, till skillnad från kundernas fyrsiffriga PIN.
 *
 * Kunden knappar in sin kod vid en hyllkant flera gånger om dagen och ser bara
 * sina egna ordrar. Det här kontot skrivs in på ett tangentbord någon gång per
 * dag och ser ALLA kunders ordrar. Då finns det ingen anledning att spara på
 * tecken.
 */
const MIN_LÄNGD = 12;

async function main() {
  const namn = arg("namn")?.trim();
  if (!namn) avbryt('Ange namnet: --namn "Emil"');

  let kod = arg("kod")?.trim();
  const baraStatus = (flag("avaktivera") || flag("aktivera")) && !flag("byt-kod");
  if (!kod && !baraStatus) {
    // base64url ur slumpbytes: lätt att läsa upp i telefon, inga tecken som
    // försvinner i kopiering.
    kod = randomBytes(12).toString("base64url");
    console.log(`\n  Slumpad kod: ${kod}`);
  } else if (kod && kod.length < MIN_LÄNGD) {
    avbryt(
      `Koden är ${kod.length} tecken; minst ${MIN_LÄNGD} krävs.\n` +
        "    Kontot ser alla kunders ordrar – det är inte platsen att spara tecken.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) avbryt("NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY saknas.");

  const login = loginName(namn);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: befintlig, error: läsFel } = await db
    .from("staff_accounts")
    .select("id, name")
    .eq("login_name", login)
    .maybeSingle();

  if (läsFel) {
    avbryt(
      `Kunde inte läsa staff_accounts: ${läsFel.message}\n` +
        "    Har du kört supabase/migrations/0002_admin.sql i SQL-editorn?",
    );
  }

  const ändrar = flag("byt-kod") || flag("avaktivera") || flag("aktivera");
  if (befintlig && !ändrar) {
    avbryt(
      `${befintlig.name} finns redan som "${login}".\n` +
        "    --byt-kod sätter en ny kod, --avaktivera stänger av kontot.",
    );
  }

  if (befintlig && (flag("avaktivera") || flag("aktivera"))) {
    const active = flag("aktivera");
    const { error } = await db
      .from("staff_accounts")
      .update({ active, failed_count: 0, locked_until: null })
      .eq("id", befintlig.id);
    if (error) avbryt(`Kunde inte ändra kontots status: ${error.message}`);
    console.log(`\n  ✓ ${befintlig.name}s konto är nu ${active ? "öppet" : "avstängt"}.\n`);
    if (!flag("byt-kod")) return;
  }

  if (!kod) avbryt("Ingen kod att sätta.");
  const { pin_hash, pin_salt } = await hashPin(kod);

  if (befintlig) {
    const { error } = await db
      .from("staff_accounts")
      .update({ pin_hash, pin_salt, failed_count: 0, locked_until: null })
      .eq("id", befintlig.id);
    if (error) avbryt(`Kunde inte byta kod: ${error.message}`);
    console.log(`\n  ✓ Ny kod satt för ${befintlig.name}.\n`);
  } else {
    const { error } = await db
      .from("staff_accounts")
      .insert({ login_name: login, name: namn, pin_hash, pin_salt });
    if (error) avbryt(`Kunde inte skapa kontot: ${error.message}`);
    console.log(
      `\n  ✓ ${namn} upplagd.\n` +
        `      Loggar in på:  /admin\n` +
        `      Namn:          ${login}\n` +
        `      Kod:           ${kod}\n\n` +
        "  Koden går inte att läsa ut igen. Tappas den bort sätter du en ny med\n" +
        "  --byt-kod.\n",
    );
  }
}

main();
