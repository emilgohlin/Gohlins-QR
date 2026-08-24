// Kvitterar att en order är omhändertagen, eller ångrar kvitteringen.
//
// Vem som kvitterade sparas, inte bara att någon gjorde det: är det två som
// jobbar i listan samtidigt är "Anna tog den 09:14" ett svar, medan "hanterad"
// bara är en fråga till.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) {
    return NextResponse.json({ fel: "Du är utloggad." }, { status: 401 });
  }

  const { id, hanterad } = (await request.json()) as { id?: string; hanterad?: boolean };
  if (!id) return NextResponse.json({ fel: "Ingen order angiven." }, { status: 400 });

  const { error } = await db()
    .from("orders")
    .update(
      hanterad
        ? { handled_at: new Date().toISOString(), handled_by: session.name }
        : { handled_at: null, handled_by: null },
    )
    .eq("id", id);

  if (error) {
    return NextResponse.json({ fel: "Gick inte att spara." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
