// Lägger upp och underhåller ett kundkonto.
//
// Ett eget skript och inte SQL i editorn, av ett enda skäl: PIN-koden får
// aldrig finnas i klartext någonstans — inte i en tabellrad, och inte i
// frågehistoriken i Supabases SQL-editor, där den annars hade legat kvar
// läsbar för var och en som öppnar projektet. Här hashas den innan den lämnar
// din dator, och det är hashen som skickas.
//
// Nytt konto:
//   npm run skapa-kund -- --kundnr 12345 --namn "Akwel" --pin 1913
//
// Utan --pin slumpas en kod fram och skrivs ut en gång. --mejl sätter adressen
// innesälj svarar till.
//
// Finns kontot redan:
//   --byt-pin                   sätter en ny PIN
//   --byt-kundnr                rättar kundnumret
//   --tidigare "gamla namnet"   byter namn på kontot
//
// Flaggorna går att kombinera. Ett namnbyte behåller kontots ordrar; att skapa
// ett nytt konto hade lämnat dem hos det gamla.

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
  const namn = arg("namn")?.trim();
  const kundnr = arg("kundnr")?.trim();
  const mejl = arg("mejl")?.trim();
  const tidigare = arg("tidigare")?.trim();

  if (!namn) avbryt('Ange företagsnamnet: --namn "Akwel"');

  // Kundnumret krävs när kontot skapas, och när det uttryckligen ska rättas.
  // Ett rent namnbyte rör det inte, och ska då inte behöva upprepa det.
  const behöverKundnr = !tidigare || flag("byt-kundnr");
  if (behöverKundnr && !kundnr) {
    avbryt(
      "Ange kundnumret hos Göhlins: --kundnr 12345\n" +
        "    Det följer med ordern som BuyerCodeEdi och är det affärssystemet\n" +
        "    känner igen kunden på. Ett gissat nummer blir en order på fel kund.",
    );
  }

  // En PIN slumpas bara när den faktiskt ska sättas. Att skriva ut en kod som
  // inte används ser ut som att kontots kod just bytts — och då byter någon
  // kodlapp i onödan, eller tror att den gamla slutat gälla.
  const sätterPin = !tidigare || flag("byt-pin");
  let pin = arg("pin")?.trim();
  if (pin && !/^\d+$/.test(pin)) {
    avbryt("PIN-koden ska bara innehålla siffror.");
  }
  if (pin && pin.length < MIN_PIN_LENGTH) {
    avbryt(`PIN-koden måste vara minst ${MIN_PIN_LENGTH} siffror.`);
  }
  if (!pin && sätterPin) {
    pin = generatePin();
    console.log(`\n  Slumpad PIN: ${pin}`);
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

  // Byter kontot namn slås det upp på det GAMLA namnet — det nya finns ju inte
  // i databasen än.
  const uppslag = tidigare ? loginName(tidigare) : login;
  const { data: befintlig } = await db
    .from("customer_accounts")
    .select("id, company_name")
    .eq("login_name", uppslag)
    .maybeSingle();

  if (tidigare && !befintlig) {
    avbryt(`Hittade inget konto som loggar in med "${uppslag}".`);
  }

  if (befintlig && !tidigare && !flag("byt-pin") && !flag("byt-kundnr")) {
    avbryt(
      `${befintlig.company_name} finns redan som "${login}".\n` +
        "    Lägg till --byt-pin för att sätta en ny PIN, --byt-kundnr för att\n" +
        '    rätta kundnumret, eller --tidigare "gamla namnet" för att byta namn.',
    );
  }

  if (befintlig) {
    if (tidigare) {
      const { error } = await db
        .from("customer_accounts")
        .update({ company_name: namn, login_name: login })
        .eq("id", befintlig.id);
      if (error) avbryt(`Kunde inte byta namn: ${error.message}`);
      console.log(
        `\n  ✓ ${befintlig.company_name} heter nu ${namn}.\n` +
          `      Loggar in med:  ${login}  (tidigare "${uppslag}")`,
      );
    }

    // Kundnumret kan rättas i efterhand. Det behövs: appen tas i bruk innan
    // affärssystemskopplingen finns, och då mejlas ordern till en människa som
    // känner igen kunden på namnet. Numret måste däremot stämma INNAN
    // orderinläsningen börjar läsa filen, för då är det numret som gäller.
    if (flag("byt-kundnr")) {
      const { error } = await db
        .from("customer_accounts")
        .update({ kundnr })
        .eq("id", befintlig.id);
      if (error) avbryt(`Kunde inte byta kundnummer: ${error.message}`);
      console.log(`  ✓ Kundnr är nu ${kundnr}.`);
    }

    if (mejl) {
      const { error } = await db
        .from("customer_accounts")
        .update({ contact_email: mejl })
        .eq("id", befintlig.id);
      if (error) avbryt(`Kunde inte spara mejladressen: ${error.message}`);
      console.log(`  ✓ Mejladress: ${mejl}`);
    }

    if (flag("byt-pin")) {
      if (!pin) avbryt("Ingen PIN att sätta.");
      const { pin_hash, pin_salt } = await hashPin(pin);
      // Räknaren nollas: ett lås från de gamla försöken ska inte följa med den
      // nya koden, för då hjälper inte bytet.
      const { error } = await db
        .from("customer_accounts")
        .update({ pin_hash, pin_salt, failed_count: 0, locked_until: null })
        .eq("id", befintlig.id);
      if (error) avbryt(`Kunde inte byta PIN: ${error.message}`);
      console.log(`  ✓ Ny PIN: ${pin}`);
    }

    console.log("");
    return;
  }

  if (!pin) avbryt("Ingen PIN att sätta.");
  const { pin_hash, pin_salt } = await hashPin(pin);
  const { error } = await db.from("customer_accounts").insert({
    kundnr: kundnr!,
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

main();
