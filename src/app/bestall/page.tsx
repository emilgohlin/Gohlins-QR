import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { db } from "@/lib/db";
import Bestallning from "./Bestallning";

export default async function Bestallningssidan() {
  // Sessionen läses HÄR, på servern, och inte i proxy.ts. Proxyn ser bara att
  // en kaka finns; det är den här kontrollen som verifierar signaturen och
  // avgör vem kunden är.
  const session = await readSession();
  if (!session) redirect("/");

  // Mottagarna hämtas på servern och skickas med sidan. Ett extra API-anrop
  // från klienten hade bara gett en tom rullgardin en kort stund – och det är
  // just i det ögonblicket kunden hinner trycka.
  const { data: mottagare } = await db()
    .from("delivery_recipients")
    .select("code, name, street, zip_city")
    .eq("account_id", session.id)
    .eq("active", true)
    .order("sort_order");

  return (
    <Bestallning
      företag={session.companyName}
      kundnr={session.kundnr}
      mottagare={(mottagare ?? []).map((m) => ({
        kod: m.code,
        namn: m.name,
        adress: [m.street, m.zip_city].filter(Boolean).join(", "),
      }))}
    />
  );
}
