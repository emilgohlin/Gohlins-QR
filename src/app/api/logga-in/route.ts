// Inloggning: företagsnamn + PIN.
//
// Hela skyddet ligger här, så läs innan du ändrar. Ett företagsnamn är
// gissningsbart och PIN är fyra siffror — det är alltså LÅSET som gör gissning
// meningslös, inte kodens längd. Räknaren och låset måste därför uppdateras på
// varje felaktigt försök, även när kontot inte finns.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPin, loginName, MAX_FAILED, LOCK_MINUTES } from "@/lib/pin";
import { startSession } from "@/lib/session";

interface Konto {
  id: string;
  kundnr: string;
  company_name: string;
  pin_hash: string;
  pin_salt: string;
  active: boolean;
  failed_count: number;
  locked_until: string | null;
}

/** Samma text oavsett om företaget inte finns eller PIN är fel. Skiljer sig
 *  svaren åt går det att kartlägga vilka företag som är kunder. */
const FEL = "Fel företagsnamn eller PIN.";

export async function POST(request: Request) {
  const { namn, pin } = (await request.json()) as { namn?: string; pin?: string };
  if (!namn?.trim() || !pin?.trim()) {
    return NextResponse.json({ fel: FEL }, { status: 400 });
  }

  const { data, error: dbFel } = await db()
    .from("customer_accounts")
    .select("id, kundnr, company_name, pin_hash, pin_salt, active, failed_count, locked_until")
    .eq("login_name", loginName(namn))
    .maybeSingle();
  // Se kommentaren i admin/logga-in: ett databasfel som ser ut som fel PIN är
  // det dyraste felet att leta efter.
  if (dbFel) console.error("Inloggning mot customer_accounts misslyckades", dbFel);
  const konto = data as Konto | null;

  if (!konto || !konto.active) {
    // Kontrollera PIN ändå, mot en hash som aldrig går igenom. Utan det svarar
    // ett okänt företagsnamn direkt medan ett känt tar 100 ms att svara, och
    // svarstiden avslöjar vilka som är kunder.
    await verifyPin(pin, { pin_hash: "00", pin_salt: "00" });
    return NextResponse.json({ fel: FEL }, { status: 401 });
  }

  const låstTill = konto.locked_until ? new Date(konto.locked_until) : null;
  if (låstTill && låstTill > new Date()) {
    const minuter = Math.max(1, Math.ceil((låstTill.getTime() - Date.now()) / 60000));
    return NextResponse.json(
      { fel: `Kontot är låst efter för många försök. Försök igen om ${minuter} minuter.` },
      { status: 429 },
    );
  }

  // Har låset löpt ut börjar räkningen om. Utan nollställningen ligger
  // failed_count kvar på fem, och FÖRSTA felskrivningen efter kvarten låser
  // kontot igen — kunden får aldrig ett enda försök på sig.
  const tidigareFel = låstTill ? 0 : konto.failed_count;

  if (!(await verifyPin(pin, konto))) {
    const failed = tidigareFel + 1;
    await db()
      .from("customer_accounts")
      .update({
        failed_count: failed,
        locked_until:
          failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : null,
      })
      .eq("id", konto.id);

    // Samma svar oavsett hur många försök som är kvar.
    //
    // Att räkna ned åt kunden vore vänligt, men "3 försök kvar" säger också att
    // företaget FINNS som kund — ett okänt namn får ju ingen nedräkning. Då är
    // hela poängen med ett gemensamt felmeddelande borta, och man kan kartlägga
    // Göhlins kundregister med en namnlista. Låsbeskedet är kvar: det kostar
    // fem försök mot ett och samma namn att komma åt.
    return NextResponse.json(
      { fel: failed >= MAX_FAILED ? `Kontot är nu låst i ${LOCK_MINUTES} minuter.` : FEL },
      { status: 401 },
    );
  }

  // Lyckad inloggning nollar räknaren – annars hade fyra felskrivningar under
  // en vecka låst en kund som aldrig gjort något fel.
  await db()
    .from("customer_accounts")
    .update({ failed_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", konto.id);

  await startSession(konto);
  return NextResponse.json({ ok: true, företag: konto.company_name });
}
