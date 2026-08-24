import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import Bestallning from "./Bestallning";

export default async function Bestallningssidan() {
  // Sessionen läses HÄR, på servern, och inte i proxy.ts. Proxyn ser bara att
  // en kaka finns; det är den här kontrollen som verifierar signaturen och
  // avgör vem kunden är.
  const session = await readSession();
  if (!session) redirect("/");
  return <Bestallning företag={session.companyName} kundnr={session.kundnr} />;
}
