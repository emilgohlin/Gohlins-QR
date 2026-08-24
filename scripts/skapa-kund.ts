// Lägger upp ett kundkonto.
//
// Ett eget skript och inte SQL i editorn, av ett enda skäl: PIN-koden får
// aldrig finnas i klartext någonstans — inte i en tabellrad, och inte i
// frågehistoriken i Supabases SQL-editor, där den annars hade legat kvar
// läsbar för var och en som öppnar projektet. Här hashas den innan den lämnar
// din dator, och det är hashen som skickas.
//
// Körs med:
//   npm run skapa-kund -- --kundnr 12345 --namn "Ackwell" --pin 1913
//
// Utan --pin slumpas en sexsiffrig kod fram och skrivs ut en gång.

import { createClient } from "@supabase/supabase-js";
import { hashPin, loginName, generatePin, MIN_PIN_LENGTH } from "../src/lib/pin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function avbryt(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

// Allt i main(): toppnivå-await går inte i ett CommonJS-projekt.
async function main() {
  const kundnr = arg("kundnr")?.trim();
  const namn = arg("namn")?.trim();
  const mejl = arg("mejl")?.trim();
  let pin = arg("pin")?.trim();

  if (!namn) avbryt('Ange företagsnamnet: --namn "Ackwell"');
  if (!kundnr) {
  avbryt(
    "Ange kundnumret hos Göhlins: --kundnr 12345\n" +
      "    Det följer med ordern som BuyerCodeEdi och är det affärssystemet\n" +
      "    känner igen kunden på. Ett gissat nummer blir en order på fel kund.",
  );
  }

  if (!pin) {
  pin = generatePin();
  console.log(`\n  Slumpad PIN: ${pin}`);
  } else if (!/^\d+$/.test(pin)) {
  avbryt("PIN-koden ska bara innehålla siffror.");
  } else if (pin.length < MIN_PIN_LENGTH && !flag("kort-pin")) {
  // Kontot låses 15 minuter efter 5 fel, alltså ~480 försök per dygn. En
  // fyrsiffrig PIN har 10 000 möjligheter och är därför genomgången på ett par
  // veckor av någon som orkar. Sexsiffrig tar 200 år. Vill du ändå ha den korta
  // är det ett medvetet val, och då säger du det med flaggan.
  avbryt(
    `PIN-koden är ${pin.length} siffror; minst ${MIN_PIN_LENGTH} rekommenderas.\n` +
      "    Lägg till --kort-pin om du ändå vill använda den.",
  );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    avbryt(
      "NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY saknas.\n" +
        "    Kopiera .env.example till .env.local och fyll i dem.",
    );
  }

  const login = loginName(namn);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: befintlig } = await db
    .from("customer_accounts")
    .select("id, company_name")
    .eq("login_name", login)
    .maybeSingle();

  if (befintlig && !flag("byt-pin")) {
    avbryt(
      `${befintlig.company_name} finns redan som "${login}".\n` +
        "    Lägg till --byt-pin för att sätta en ny PIN på kontot i stället.",
    );
  }

  const { pin_hash, pin_salt } = await hashPin(pin);

  if (befintlig) {
    // Räknaren nollas: ett lås från de gamla försöken ska inte följa med den nya
    // koden, för då hjälper inte bytet.
    const { error } = await db
      .from("customer_accounts")
      .update({ pin_hash, pin_salt, failed_count: 0, locked_until: null })
      .eq("id", befintlig.id);
    if (error) avbryt(`Kunde inte byta PIN: ${error.message}`);
    console.log(`\n  ✓ Ny PIN satt för ${befintlig.company_name}.\n`);
  } else {
    const { error } = await db.from("customer_accounts").insert({
      kundnr,
      company_name: namn,
      login_name: login,
      pin_hash,
      pin_salt,
      contact_email: mejl ?? null,
    });
    if (error) avbryt(`Kunde inte skapa kontot: ${error.message}`);
    console.log(
      `\n  ✓ ${namn} upplagd.\n` +
        `      Kundnr:         ${kundnr}\n` +
        `      Loggar in med:  ${login}\n` +
        `      PIN:            ${pin}\n\n` +
        "  Ge kunden de två sista raderna. PIN-koden går inte att läsa ut igen —\n" +
        "  den finns bara som hash i databasen. Tappas den bort sätter du en ny\n" +
        "  med --byt-pin.\n",
    );
  }
}

main();
