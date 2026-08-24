// Personalens inloggning till adminvyn.
//
// Samma modell som kundinloggningen: hash, tidskonstant jämförelse, lås efter
// upprepade fel. Skillnaden är vad kontot ser. En kund som gissar sig in ser
// sina egna ordrar; den som gissar sig in HÄR ser allas.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPin, loginName, MAX_FAILED, LOCK_MINUTES } from "@/lib/pin";
import { startAdminSession } from "@/lib/session";
import type { StaffAccount } from "@/lib/database.types";

const FEL = "Fel namn eller lösenord.";

export async function POST(request: Request) {
  const { namn, kod } = (await request.json()) as { namn?: string; kod?: string };
  if (!namn?.trim() || !kod?.trim()) {
    return NextResponse.json({ fel: FEL }, { status: 400 });
  }

  const { data, error: dbFel } = await db()
    .from("staff_accounts")
    .select("id, name, pin_hash, pin_salt, active, failed_count, locked_until")
    .eq("login_name", loginName(namn))
    .maybeSingle();
  // Ett databasfel får ALDRIG bara bli "fel lösenord" mot användaren och
  // tystnad i loggen. Saknas tabellen, eller är nyckeln fel, ser inloggningen
  // likadan ut som en felskriven kod – och man letar på fel ställe i timmar.
  if (dbFel) console.error("Inloggning mot staff_accounts misslyckades", dbFel);
  const konto = data as Pick<
    StaffAccount,
    "id" | "name" | "pin_hash" | "pin_salt" | "active" | "failed_count" | "locked_until"
  > | null;

  if (!konto || !konto.active) {
    // Kontrollera ändå, mot en hash som aldrig går igenom: svarstiden ska inte
    // avslöja vilka namn som finns.
    await verifyPin(kod, { pin_hash: "00", pin_salt: "00" });
    return NextResponse.json({ fel: FEL }, { status: 401 });
  }

  if (konto.locked_until && new Date(konto.locked_until) > new Date()) {
    const minuter = Math.max(
      1,
      Math.ceil((new Date(konto.locked_until).getTime() - Date.now()) / 60000),
    );
    return NextResponse.json(
      { fel: `Kontot är låst. Försök igen om ${minuter} minuter.` },
      { status: 429 },
    );
  }

  if (!(await verifyPin(kod, konto))) {
    const failed = konto.failed_count + 1;
    await db()
      .from("staff_accounts")
      .update({
        failed_count: failed,
        locked_until:
          failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : null,
      })
      .eq("id", konto.id);
    return NextResponse.json({ fel: FEL }, { status: 401 });
  }

  await db()
    .from("staff_accounts")
    .update({ failed_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", konto.id);

  await startAdminSession(konto);
  return NextResponse.json({ ok: true, namn: konto.name });
}
