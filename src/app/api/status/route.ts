// Säger vilka miljövariabler som saknas – och bara det.
//
// Bakgrunden: ett ouppfyllt env-krav blir ett kastat fel, och Next svarar då
// med en TOM 500:a i drift. Felet står i serverloggen, men den som satt upp
// appen ser bara att "det funkar inte" och får gissa vilken variabel det gäller.
// Den gissningsleken kostar mer än den här rutten gör.
//
// VAD SOM ALDRIG LÄMNAR RUTTEN: värden. Bara namn och ja/nej. Att veta att
// SUPABASE_SERVICE_ROLE_KEY är satt hjälper ingen som inte redan har den, och
// att veta att den INTE är satt är precis vad man behöver för att fixa felet.

import { NextResponse } from "next/server";

const KRÄVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "ORDER_EMAIL_TO"];

/** Mejlutskicket är avsiktligt frivilligt tills avsändarpostlådan finns. */
const FRIVILLIGA = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "ORDER_EMAIL_FROM"];

export async function GET() {
  const saknas = KRÄVS.filter((namn) => !process.env[namn]);
  return NextResponse.json(
    {
      ok: saknas.length === 0,
      saknas,
      mejlutskick: FRIVILLIGA.every((namn) => process.env[namn]) ? "påslaget" : "avstängt",
    },
    { status: saknas.length === 0 ? 200 : 503 },
  );
}
