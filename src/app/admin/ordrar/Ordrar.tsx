"use client";

// Listan innesälj arbetar ur.
//
// Ordningen är medveten: OHANTERADE FÖRST, nyast överst. Listan ska svara på
// frågan "vad ligger och väntar", inte "vad har hänt". Det som är kvitterat
// finns kvar men tonas ned, så det går att gå tillbaka till.

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminRad {
  artikelnummer: string;
  benämning: string;
  antal: number;
  enhet: string;
  rå: string | null;
}

export interface AdminOrder {
  id: string;
  ordernummer: string;
  företag: string;
  kundnr: string;
  mejl: string | null;
  referens: string;
  märke: string | null;
  status: string;
  fel: string | null;
  skapad: string;
  mejlad: string | null;
  hanterad: string | null;
  hanteradAv: string | null;
  rader: AdminRad[];
}

function tidpunkt(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Antal utan onödiga decimaler: "4" och "2,5", inte "4.00". */
function antal(n: number): string {
  return String(n).replace(".", ",");
}

/**
 * Vad statusen betyder för den som läser listan.
 *
 * Skillnaden som betyder något: "mottagen" är en order som ligger och väntar på
 * DIG — normalläget så länge mejlutskicket inte är påslaget. "misslyckad" är
 * ett mejl som försöktes och inte gick fram, alltså ett fel att åtgärda. Ser de
 * två likadana ut slutar man snart titta på båda.
 */
function mejlstatus(order: AdminOrder): { text: string; klass: string } {
  if (order.status === "skickad") {
    return {
      text: `Mejlad ${order.mejlad ? tidpunkt(order.mejlad) : ""}`.trim(),
      klass: "bg-green-50 text-green-800",
    };
  }
  if (order.status === "misslyckad") {
    return { text: "Mejlet gick inte fram", klass: "bg-red-50 text-red-800" };
  }
  if (order.status === "mottagen") {
    return { text: "Mottagen – läggs in för hand", klass: "bg-gray-100 text-gray-700" };
  }
  return { text: "Utkast", klass: "bg-gray-100 text-gray-600" };
}

export default function Ordrar({
  ordrar,
  användare,
}: {
  ordrar: AdminOrder[];
  användare: string;
}) {
  const router = useRouter();
  const [baraOhanterade, setBaraOhanterade] = useState(true);
  const [arbetar, setArbetar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const ohanterade = ordrar.filter((o) => !o.hanterad);
  // Ohanterade först, nyast överst inom varje grupp. Listan ska svara på "vad
  // ligger och väntar" – med filtret avslaget låg det som väntade annars
  // inblandat bland det som redan var gjort, sorterat på datum.
  const synliga = baraOhanterade
    ? ohanterade
    : [...ohanterade, ...ordrar.filter((o) => o.hanterad)];

  async function kvittera(order: AdminOrder) {
    setArbetar(order.id);
    setFel(null);
    try {
      const res = await fetch("/api/admin/hanterad", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, hanterad: !order.hanterad }),
      });
      // Utan den här kontrollen ser en utloggad session ut som en lyckad
      // kvittering: knappen släpper, listan ritas om oförändrad, och ordern
      // ligger kvar utan att någon vet om den är omhändertagen.
      if (!res.ok) {
        const svar = (await res.json().catch(() => ({}))) as { fel?: string };
        setFel(
          res.status === 401
            ? "Du är utloggad. Ladda om sidan och logga in igen."
            : (svar.fel ?? "Kvitteringen sparades inte. Försök igen."),
        );
        return;
      }
      router.refresh();
    } catch {
      setFel("Ingen kontakt med servern. Kvitteringen sparades inte.");
    } finally {
      setArbetar(null);
    }
  }

  async function loggaUt() {
    await fetch("/api/admin/logga-ut", { method: "POST" });
    router.refresh();
    router.push("/admin");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inkomna ordrar</h1>
          <p className="text-sm text-gray-500">
            {ohanterade.length === 0
              ? "Inget ligger och väntar."
              : `${ohanterade.length} väntar på att läggas in.`}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{användare}</span>
          <button type="button" onClick={loggaUt} className="text-gray-500 underline">
            Logga ut
          </button>
        </div>
      </header>

      {fel && (
        <p
          role="alert"
          className="mt-4 rounded-xl border-l-4 border-gohlins bg-gohlins-ljus px-4 py-3 text-sm text-gray-900"
        >
          {fel}
        </p>
      )}

      <label className="mt-5 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={baraOhanterade}
          onChange={(e) => setBaraOhanterade(e.target.checked)}
          className="h-4 w-4"
        />
        Visa bara det som inte är hanterat
      </label>

      {synliga.length === 0 ? (
        <p className="mt-16 text-center text-gray-500">
          {ordrar.length === 0
            ? "Inga ordrar än. De dyker upp här så fort en kund skickar en."
            : "Allt är hanterat."}
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {synliga.map((order) => {
            const status = mejlstatus(order);
            return (
              <li
                key={order.id}
                className={`rounded-2xl border bg-white p-4 ${
                  order.hanterad
                    ? "border-gray-200 opacity-60"
                    : "border-gray-300 border-l-4 border-l-gohlins"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <h2 className="text-lg font-semibold">{order.företag}</h2>
                    <p className="text-sm text-gray-500">
                      {order.ordernummer} · kundnr {order.kundnr || "–"} · {tidpunkt(order.skapad)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${status.klass}`}>
                    {status.text}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-700">
                  Referens: <span className="font-medium">{order.referens}</span>
                  {order.märke && (
                    <>
                      {" · "}Märke/ordernr:{" "}
                      <span className="font-medium">{order.märke}</span>
                    </>
                  )}
                  {order.mejl && <span className="text-gray-500"> · {order.mejl}</span>}
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-md text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-1 pr-3 font-medium">Artikelnr</th>
                        <th className="pb-1 pr-3 font-medium">Benämning</th>
                        <th className="pb-1 font-medium">Antal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.rader.map((rad, i) => (
                        <tr key={i} className="border-t border-gray-100 align-top">
                          <td className="py-1.5 pr-3 font-mono">{rad.artikelnummer}</td>
                          <td className="py-1.5 pr-3">
                            {rad.benämning || (
                              <span className="text-gray-400">(ingen benämning i koden)</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-1.5">
                            {antal(rad.antal)} {rad.enhet}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Råkoderna göms men slängs inte: blir en rad fel är det den
                    som visar om koden var feltolkad eller om kunden skannade
                    fel dekal. */}
                {order.status === "misslyckad" && order.fel && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                    {order.fel}
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-500">
                    Visa skannade koder
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {order.rader.map((rad, i) => (
                      <li key={i} className="font-mono text-xs break-all text-gray-500">
                        {rad.rå ?? "(inskrivet för hand)"}
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="mt-4 flex items-center justify-between gap-3">
                  {order.hanterad ? (
                    <p className="text-sm text-gray-500">
                      Hanterad av {order.hanteradAv} · {tidpunkt(order.hanterad)}
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => kvittera(order)}
                    disabled={arbetar === order.id}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${
                      order.hanterad
                        ? "border border-gray-300 text-gray-700"
                        : "bg-gohlins text-white transition-colors hover:bg-gohlins-mork"
                    }`}
                  >
                    {arbetar === order.id
                      ? "…"
                      : order.hanterad
                        ? "Ångra"
                        : "Markera som hanterad"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
