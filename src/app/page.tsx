import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import Inloggning from "./Inloggning";

export default async function Startsidan() {
  // Redan inloggad? Då är det beställningen kunden vill åt, inte formuläret.
  if (await readSession()) redirect("/bestall");
  return <Inloggning />;
}
