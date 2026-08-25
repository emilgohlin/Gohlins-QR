// Kundens egna ordrar.
//
// Hela vyn är en serverkomponent utan klientkod: den ska bara visa, och en
// lista som inte gör något behöver inget JavaScript för att göra det.
//
// SÄKERHETEN LIGGER I FILTRET. account_id kommer ur den signerade
// sessionskakan, aldrig ur något kunden kan skriva om. Tabellerna har RLS utan
// policyer, så det är den här raden som håller isär kundernas ordrar — ändra
// den aldrig utan att tänka efter.

import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { db } from "@/lib/db";

/** Så många ordrar visas. Räcker långt bakåt för en kund som beställer
 *  varje vecka, utan att sidan blir en arkivvy. */
const ANTAL = 50;

function tidpunkt(iso: string, medTid = true): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    ...(medTid ? { timeStyle: "short" as const } : {}),
  }).format(new Date(iso));
}

function antal(n: number): string {
  return String(n).replace(".", ",");
}

export default async function MinaOrdrar() {
  const session = await readSession();
  if (!session) redirect("/");

  const { data: ordrar } = await db()
    .from("orders")
    .select("id, order_number, reference, marking, recipient_code, recipient_name, created_at, handled_at")
    .eq("account_id", session.id)
    .order("created_at", { ascending: false })
    .limit(ANTAL);

  const rader = ordrar ?? [];
  const { data: orderrader } = rader.length
    ? await db()
        .from("order_lines")
        .select("order_id, article_number, article_name, quantity, unit, sort_order")
        .in("order_id", rader.map((o) => o.id))
        .order("sort_order")
    : { data: [] };

  return (
    <main className="mx-auto max-w-md px-4 pb-12 pt-6">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Mina ordrar</h1>
          <p className="text-sm text-gray-500">{session.companyName}</p>
        </div>
        <Link href="/bestall" className="shrink-0 text-sm text-gohlins-mork underline">
          Beställ nytt
        </Link>
      </header>

      {rader.length === 0 ? (
        <p className="mt-16 text-center text-gray-500">
          Du har inte skickat någon order än.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rader.map((order) => {
            const mina = (orderrader ?? []).filter((r) => r.order_id === order.id);
            return (
              <li key={order.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-bold">{order.reference}</p>
                    <p className="text-sm text-gray-500">
                      {tidpunkt(order.created_at)} · {order.order_number}
                    </p>
                  </div>
                  {/* Det enda kunden egentligen undrar: har någon tagit i den?
                      Därför är statusen det som syns tydligast på kortet. */}
                  {order.handled_at ? (
                    <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-800">
                      Behandlad {tidpunkt(order.handled_at, false)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                      Mottagen – vi återkommer
                    </span>
                  )}
                </div>

                {(order.marking || order.recipient_name) && (
                  <p className="mt-2 text-sm text-gray-600">
                    {order.marking && <>Märke {order.marking}</>}
                    {order.marking && order.recipient_name && " · "}
                    {order.recipient_name &&
                      `${order.recipient_code ? `${order.recipient_code} · ` : ""}${order.recipient_name}`}
                  </p>
                )}

                <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                  {mina.map((rad, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="font-mono text-sm font-bold">{rad.article_number}</span>
                        {rad.article_name && (
                          <span className="block truncate text-sm text-gray-600">
                            {rad.article_name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {antal(rad.quantity)} {rad.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-center text-xs text-gray-500">
        &quot;Behandlad&quot; betyder att Göhlins har tagit hand om ordern och lagt in den.
        Hör av dig till din säljare om något behöver ändras.
      </p>
    </main>
  );
}
