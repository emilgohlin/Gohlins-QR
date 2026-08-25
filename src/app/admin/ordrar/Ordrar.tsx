"use client";

// Listan innesälj arbetar ur.
//
// Ordningen är medveten: OHANTERADE FÖRST, nyast överst. Listan ska svara på
// frågan "vad ligger och väntar", inte "vad har hänt". Det som är kvitterat
// finns kvar men tonas ned, så det går att gå tillbaka till.
//
// KORTET ÄR ETT UNDERLAG ATT SKRIVA AV, inte en sammanfattning. Den som lägger
// in ordern i Monitor sitter med två fönster och flyttar värden mellan dem, så
// allt som ska flyttas går att kopiera med ett klick — kundnumret och varje
// artikelnummer. Att markera en textsnutt med musen och trycka ctrl+C tjugo
// gånger är den sortens arbete som blir fel den tjugoförsta gången.
//
// Uppgifterna står på var sin rad av samma skäl. Referens och märke på samma
// rad, åtskilda av en punkt, sparar en radhöjd och kostar en läsning extra
// varje gång.

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Värde som kopieras med ett klick.
 *
 * Visar värdet självt som knapp – att klicka på artikelnumret för att kopiera
 * artikelnumret behöver ingen förklaring. Kvittensen är kort och tydlig, för
 * utan den vet man inte om klicket tog.
 */
function Kopiera({
  värde,
  className = "",
  etikett,
}: {
  värde: string;
  className?: string;
  etikett: string;
}) {
  const [läge, setLäge] = useState<"vila" | "kopierad" | "fel">("vila");

  async function kopiera() {
    try {
      await navigator.clipboard.writeText(värde);
      setLäge("kopierad");
    } catch {
      // Urklipp kräver säker anslutning och kan nekas av webbläsaren. Att
      // misslyckas tyst vore värst av allt: då klistrar man in det som råkade
      // ligga i urklippet sedan tidigare.
      setLäge("fel");
    }
    setTimeout(() => setLäge("vila"), 1400);
  }

  return (
    <button
      type="button"
      onClick={kopiera}
      title={`Kopiera ${etikett}`}
      aria-label={`Kopiera ${etikett}: ${värde}`}
      className={`group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-gray-100 ${
        läge === "kopierad" ? "bg-green-50" : läge === "fel" ? "bg-red-50" : ""
      } ${className}`}
    >
      <span>{värde}</span>
      <span
        aria-hidden
        className={`text-xs font-normal ${
          läge === "kopierad"
            ? "text-green-700"
            : läge === "fel"
              ? "text-red-700"
              : "text-gray-400 opacity-0 transition-opacity group-hover:opacity-100"
        }`}
      >
        {läge === "kopierad" ? "kopierat" : läge === "fel" ? "gick inte" : "⧉"}
      </span>
    </button>
  );
}

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
  mottagare: { kod: string; namn: string; adress: string } | null;
  /** Anteckning om kunden – visas på varje order, inte bara en gång. */
  anteckning: string | null;
  status: string;
  fel: string | null;
  skapad: string;
  mejlad: string | null;
  hanterad: string | null;
  hanteradAv: string | null;
  rader: AdminRad[];
}

type Flik = "aktiva" | "alla" | "historiska";

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
  kapat,
  tak,
}: {
  ordrar: AdminOrder[];
  användare: string;
  /** Sant när listan slog i taket och äldre ordrar inte kom med. */
  kapat: boolean;
  tak: number;
}) {
  const router = useRouter();
  const [flik, setFlik] = useState<Flik>("aktiva");
  const [arbetar, setArbetar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const ohanterade = ordrar.filter((o) => !o.hanterad);
  // Historiken sorteras på NÄR den hanterades, inte när ordern kom in. Letar
  // man i efterhand letar man efter något man nyss gjorde.
  const hanterade = ordrar
    .filter((o) => o.hanterad)
    .sort((a, b) => (b.hanterad ?? "").localeCompare(a.hanterad ?? ""));

  const synliga =
    flik === "aktiva"
      ? ohanterade
      : flik === "historiska"
        ? hanterade
        : // Samtliga: ohanterade först ändå. Även när man tittar på allt är
          // det som väntar det man ska agera på.
          [...ohanterade, ...hanterade];

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

      {/* Flikar och inte en kryssruta: en kryssruta beskriver ett filter man
          måste tänka på, flikar beskriver tre vyer man växlar mellan. Antalen
          står i flikarna, så man ser om det finns något där utan att gå dit. */}
      <div role="tablist" aria-label="Vilka ordrar som visas" className="mt-5 flex gap-1 rounded-xl bg-gray-100 p-1">
        {(
          [
            ["aktiva", "Aktiva", ohanterade.length],
            ["alla", "Samtliga", ordrar.length],
            ["historiska", "Historik", hanterade.length],
          ] as const
        ).map(([id, namn, antal]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={flik === id}
            onClick={() => setFlik(id)}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-bold transition-colors ${
              flik === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {namn}
            <span className={`ml-1.5 font-normal ${flik === id ? "text-gray-500" : "text-gray-400"}`}>
              {antal}
            </span>
          </button>
        ))}
      </div>

      {kapat && flik !== "aktiva" && (
        <p className="mt-3 rounded-xl bg-gray-100 px-4 py-2 text-xs text-gray-600">
          Visar de {tak} senaste ordrarna. Äldre än så finns kvar i databasen men
          hämtas inte hit.
        </p>
      )}

      {synliga.length === 0 ? (
        <p className="mt-16 text-center text-gray-500">
          {ordrar.length === 0
            ? "Inga ordrar än. De dyker upp här så fort en kund skickar en."
            : flik === "aktiva"
              ? "Allt är hanterat."
              : "Ingen order är hanterad än."}
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
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">{order.företag}</h2>
                    <p className="text-sm text-gray-500">{tidpunkt(order.skapad)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${status.klass}`}>
                    {status.text}
                  </span>
                </div>

                {/* Kundnumret är det första som skrivs in i Monitor, och det
                    enda fältet där en felskriven siffra ger en order på fel
                    kund. Därför överst och kopierbart. */}
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Kundnr</span>
                  {order.kundnr ? (
                    <Kopiera
                      värde={order.kundnr}
                      etikett="kundnummer"
                      className="-ml-1 font-mono text-base font-bold"
                    />
                  ) : (
                    <span className="text-gray-400">saknas</span>
                  )}
                </div>

                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 text-gray-500">Er referens</dt>
                    <dd className="font-bold">{order.referens}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 text-gray-500">Märke/ordernr</dt>
                    <dd className={order.märke ? "font-bold" : "text-gray-400"}>
                      {order.märke ?? "—"}
                    </dd>
                  </div>
                  {order.mejl && (
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-gray-500">Mejl</dt>
                      <dd className="break-all text-gray-700">{order.mejl}</dd>
                    </div>
                  )}
                </dl>

                {/* Anteckningen står HÖGT och syns på varje order. En
                    instruktion som gäller varje gång ("alla QR-ordrar ska
                    offereras till …") får inte ligga där man måste leta. */}
                {order.anteckning && (
                  <p className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {order.anteckning}
                  </p>
                )}

                {order.mottagare && (
                  <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-gray-500">Leverans till </span>
                    <span className="font-bold">
                      {order.mottagare.kod && `${order.mottagare.kod} · `}
                      {order.mottagare.namn}
                    </span>
                    {order.mottagare.adress && (
                      <span className="block text-gray-600">{order.mottagare.adress}</span>
                    )}
                  </p>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    {/* Artikelnr och antal ligger BREDVID varandra: det är de
                        två värden som skrivs in efter varandra i Monitor, och
                        med benämningen emellan tvingas blicken fram och
                        tillbaka över raden för varje artikel.
                        Den lodräta linjen är inte dekoration. Två tal intill
                        varandra utan avgränsare läses lätt som ett, och
                        "100012 3" är precis den sortens hopblandning som ger
                        en order på tre av fel artikel. */}
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-1 pr-2 font-medium">Artikelnr</th>
                        <th className="border-l border-gray-300 pb-1 pl-3 pr-3 text-right font-medium">
                          Antal
                        </th>
                        <th className="pb-1 pl-4 font-medium">Benämning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.rader.map((rad, i) => (
                        <tr key={i} className="border-t border-gray-100 align-middle">
                          <td className="w-px whitespace-nowrap py-1 pr-2">
                            <Kopiera
                              värde={rad.artikelnummer}
                              etikett="artikelnummer"
                              className="-ml-2 font-mono text-base font-bold"
                            />
                          </td>
                          {/* Antalet är det andra värdet som skrivs in, och en
                              siffra som läses fel blir en felleverans. Stort,
                              fetstilt och med tabellsiffror så kolumnen går att
                              läsa rakt nedåt. */}
                          <td className="w-px whitespace-nowrap border-l border-gray-300 py-1 pl-3 pr-3 text-right text-base font-bold tabular-nums">
                            {antal(rad.antal)}{" "}
                            <span className="text-sm font-normal text-gray-500">{rad.enhet}</span>
                          </td>
                          <td className="py-1 pl-4">
                            {rad.benämning || (
                              <span className="text-gray-400">(ingen benämning i koden)</span>
                            )}
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
                    Visa skannade koder och appens ordernummer
                  </summary>
                  {/* Appens ordernummer står inte i huvudet: bredvid Monitors
                      eget nummer blir två ordernummer på samma skärm, och det
                      är förvirring utan nytta för den som registrerar.
                      Det står däremot KVAR här, för kunden har fått det på sin
                      kvittens och kan hänvisa till det när hen ringer. */}
                  <p className="mt-2 text-xs text-gray-500">
                    Appens ordernummer: <span className="font-mono">{order.ordernummer}</span>
                  </p>
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
