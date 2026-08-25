// Alla kunders ordrar, nyast först.
//
// Sidan hämtar i tre steg i stället för med en inbäddad join. Det är avsiktligt:
// databastyperna är handskrivna utan relationer (se database.types.ts), och tre
// enkla frågor är lättare att läsa än en join vars form bara finns i en sträng.

import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import Ordrar, { type AdminOrder } from "./Ordrar";

/**
 * Så många ordrar hämtas.
 *
 * Taket måste SYNAS när det slår i. En historikflik som tyst slutar vid 500
 * ordrar ser ut som att det inte finns fler, och den som letar efter en gammal
 * order drar slutsatsen att den aldrig kom in.
 */
const ANTAL = 500;

export default async function Ordersidan() {
  const session = await readAdminSession();
  if (!session) redirect("/admin");

  // Kontot kontrolleras vid varje sidvisning, inte bara vid inloggningen.
  // Sessionen lever i tolv timmar, och ett avstängt konto ska sluta se andras
  // ordrar nu och inte i morgon bitti.
  const { data: personal } = await db()
    .from("staff_accounts")
    .select("active")
    .eq("id", session.id)
    .maybeSingle();
  if (!personal?.active) redirect("/admin");

  const { data: ordrar } = await db()
    .from("orders")
    .select("id, account_id, order_number, reference, marking, recipient_code, recipient_name, recipient_address, status, error, created_at, sent_at, handled_at, handled_by")
    .order("created_at", { ascending: false })
    .limit(ANTAL);

  const rader = ordrar ?? [];
  const { data: konton } = await db()
    .from("customer_accounts")
    .select("id, company_name, kundnr, contact_email, note");
  const { data: orderrader } = rader.length
    ? await db()
        .from("order_lines")
        .select("order_id, article_number, article_name, quantity, unit, raw_scan, sort_order")
        .in("order_id", rader.map((o) => o.id))
        .order("sort_order")
    : { data: [] };

  const kontoPerId = new Map((konton ?? []).map((k) => [k.id, k]));

  const lista: AdminOrder[] = rader.map((order) => {
    const konto = kontoPerId.get(order.account_id);
    return {
      id: order.id,
      ordernummer: order.order_number,
      företag: konto?.company_name ?? "Okänd kund",
      kundnr: konto?.kundnr ?? "",
      mejl: konto?.contact_email ?? null,
      referens: order.reference,
      märke: order.marking,
      mottagare: order.recipient_name
        ? {
            kod: order.recipient_code ?? "",
            namn: order.recipient_name,
            adress: order.recipient_address ?? "",
          }
        : null,
      anteckning: konto?.note ?? null,
      status: order.status,
      fel: order.error,
      skapad: order.created_at,
      mejlad: order.sent_at,
      hanteradAv: order.handled_by,
      hanterad: order.handled_at,
      rader: (orderrader ?? [])
        .filter((r) => r.order_id === order.id)
        .map((r) => ({
          artikelnummer: r.article_number,
          benämning: r.article_name,
          antal: r.quantity,
          enhet: r.unit,
          rå: r.raw_scan,
        })),
    };
  });

  return (
    <Ordrar
      ordrar={lista}
      användare={session.name}
      kapat={rader.length === ANTAL}
      tak={ANTAL}
    />
  );
}
