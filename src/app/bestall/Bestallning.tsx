"use client";

// Beställningen: skanna, bekräfta, checka ut.
//
// FLÖDET ÄR BYGGT FÖR EN HAND OCH EN HYLLGÅNG. Efter varje träff pausar
// kameran och visar VAD som lästes, med antalet redan ifyllt. Kunden ser att
// koden gick hem innan hen flyttar telefonen — utan den bekräftelsen står man
// och skannar samma dekal tre gånger för säkerhets skull, och får tre rader.
//
// Sedan två vägar, inte fler: skanna nästa eller checka ut. Allt annat
// (ändra, ta bort) finns kvar i radlistan, dit man kommer när skanningen är
// klar.
//
// ANTALET SPARAS SOM TEXT och tolkas först när ordern skickas. Det ser
// bakvänt ut, men ett tal i fältet gör det omöjligt att skriva "2,5": så fort
// kunden slagit kommatecknet är strängen inget giltigt tal, och fältet hade
// nollställts mitt i inmatningen.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseScan } from "@/lib/qr";
import Skanner from "./Skanner";

interface Rad {
  id: string;
  artikelnummer: string;
  benämning: string;
  /** Text under inmatning, tolkas vid utskick. */
  antal: string;
  enhet: string;
  rå: string | null;
}

export interface Mottagare {
  /** Mot.nr i Monitor. */
  kod: string;
  namn: string;
  adress: string;
}

interface Props {
  företag: string;
  kundnr: string;
  mottagare: Mottagare[];
}

function tolkaAntal(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Ökar eller minskar med ett, utan att gå under ett. */
function stega(antal: string, steg: number): string {
  const n = tolkaAntal(antal);
  if (n === null) return steg > 0 ? "1" : antal;
  return String(Math.max(1, n + steg)).replace(".", ",");
}

export default function Bestallning({ företag, kundnr, mottagare }: Props) {
  const router = useRouter();
  const [vy, setVy] = useState<"rader" | "utcheckning">("rader");
  const [rader, setRader] = useState<Rad[]>([]);
  const [referens, setReferens] = useState("");
  const [märke, setMärke] = useState("");
  // Har kunden bara en adress är valet redan gjort. Att tvinga fram ett klick
  // mellan ett alternativ är ingen kontroll, bara ett hinder.
  const [mottagarkod, setMottagarkod] = useState(
    mottagare.length === 1 ? mottagare[0].kod : "",
  );
  const [skannar, setSkannar] = useState(false);
  /** Raden som just skannades – kameran är pausad så länge den ligger här. */
  const [senaste, setSenaste] = useState<Rad | null>(null);
  const [avslag, setAvslag] = useState<string | null>(null);
  const [manuellt, setManuellt] = useState("");
  const [varning, setVarning] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);
  const [skickad, setSkickad] = useState<string | null>(null);
  const manuelltFält = useRef<HTMLInputElement>(null);

  /** Tolkar koden och lägger till raden. Returnerar null när koden avslogs. */
  function läggTill(raw: string): Rad | null {
    const resultat = parseScan(raw);
    if (!resultat.ok) return null;

    const { articleNumber, name, quantity, unit } = resultat.value;
    const rad: Rad = {
      id: crypto.randomUUID(),
      artikelnummer: articleNumber,
      benämning: name ?? "",
      // Bar koden inget antal är 1 den enda gissning som inte kan bli för
      // stor, och kunden ändrar den ändå på plats.
      antal: quantity !== null ? String(quantity).replace(".", ",") : "1",
      enhet: unit ?? "st",
      rå: resultat.value.raw,
    };
    setVarning(
      rader.some((r) => r.artikelnummer === articleNumber)
        ? `${articleNumber} fanns redan på ordern – kontrollera antalet.`
        : null,
    );
    setRader((förra) => [...förra, rad]);
    return rad;
  }

  function skannad(raw: string) {
    const rad = läggTill(raw);
    // Avslaget visas I kameravyn. Låg det på sidan bakom hade kunden aldrig
    // sett det – skannern täcker hela skärmen.
    if (rad) setSenaste(rad);
    else setAvslag(raw.trim() || "(tom kod)");
  }

  function ändra(id: string, ändring: Partial<Rad>) {
    setRader((förra) => förra.map((r) => (r.id === id ? { ...r, ...ändring } : r)));
    setSenaste((f) => (f && f.id === id ? { ...f, ...ändring } : f));
  }

  function taBort(id: string) {
    setRader((förra) => förra.filter((r) => r.id !== id));
    setSenaste((f) => (f && f.id === id ? null : f));
  }

  function läggTillManuellt(event: React.FormEvent) {
    event.preventDefault();
    const kod = manuellt.trim();
    if (!kod) return;
    // Skrivs det in för hand finns ingen kamera att bekräfta i: raden hamnar
    // direkt i listan, och ett avslag blir en varning på sidan i stället.
    if (läggTill(kod)) setManuellt("");
    else setVarning(`"${kod}" gick inte att tolka som ett artikelnummer.`);
  }

  async function skicka(event: React.FormEvent) {
    event.preventDefault();
    setFel(null);

    const trasig = rader.find((r) => tolkaAntal(r.antal) === null);
    if (trasig) {
      setFel(`Antalet på ${trasig.artikelnummer} är inte ett giltigt antal.`);
      return;
    }

    setSkickar(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: referens,
          marking: märke,
          recipient: mottagarkod,
          lines: rader.map((r) => ({
            articleNumber: r.artikelnummer,
            name: r.benämning,
            quantity: tolkaAntal(r.antal),
            unit: r.enhet,
            raw: r.rå,
          })),
        }),
      });
      // Se kommentaren i Inloggning.tsx: utan .catch blir ett serverfel till
      // ett påstått nätverksfel.
      const svar = (await res.json().catch(() => ({}))) as {
        fel?: string;
        ordernummer?: string;
      };
      if (!res.ok || !svar.ordernummer) {
        setFel(
          svar.fel ?? `Ordern kunde inte skickas (fel ${res.status}). Försök igen.`,
        );
        return;
      }
      setSkickad(svar.ordernummer);
      setRader([]);
      setReferens("");
      setMärke("");
      setMottagarkod(mottagare.length === 1 ? mottagare[0].kod : "");
      setVy("rader");
    } catch {
      setFel("Ingen kontakt med servern. Ordern är inte skickad – försök igen.");
    } finally {
      setSkickar(false);
    }
  }

  async function loggaUt() {
    await fetch("/api/logga-ut", { method: "POST" });
    router.refresh();
    router.push("/");
  }

  // ── Kvittensen ────────────────────────────────────────────────────
  if (skickad) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12 text-center">
        <p className="text-6xl text-gohlins">✓</p>
        {/* "Mottagen", inte "skickad": ordern är framme hos Göhlins i samma
            stund den ligger i adminvyn, oavsett om mejlet gick iväg. Att lova
            ett mejl som kanske inte gick är ett löfte vi inte behöver ge. */}
        <h1 className="mt-4 text-2xl font-bold">Tack, vi har din order</h1>
        <p className="mt-2 text-gray-600">
          Ordernummer <span className="font-bold text-gray-900">{skickad}</span>. Innesälj
          tar hand om den och hör av sig om något behöver stämmas av.
        </p>
        <button
          type="button"
          onClick={() => setSkickad(null)}
          className="mt-8 min-h-14 w-full rounded-xl bg-gohlins px-4 text-lg font-bold text-white"
        >
          Beställ mer
        </button>
        {/* Härifrån följer kunden ordern. Länken står just här för att det är
            nu hen undrar vad som händer härnäst. */}
        <Link
          href="/bestall/ordrar"
          className="mt-3 block py-2 text-sm text-gohlins-mork underline"
        >
          Följ dina ordrar
        </Link>
      </main>
    );
  }

  const rubrik = (
    <header className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold">{företag}</h1>
        <p className="text-sm text-gray-500">Kundnr {kundnr}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
        <Link href="/bestall/ordrar" className="text-gohlins-mork underline">
          Mina ordrar
        </Link>
        <button type="button" onClick={loggaUt} className="text-gray-500 underline">
          Logga ut
        </button>
      </div>
    </header>
  );

  // ── Utcheckningen ─────────────────────────────────────────────────
  if (vy === "utcheckning") {
    return (
      <main className="mx-auto max-w-md px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-6">
        {rubrik}

        <button
          type="button"
          onClick={() => setVy("rader")}
          className="mt-6 text-sm text-gohlins-mork underline"
        >
          ← Tillbaka till raderna
        </button>

        <h2 className="mt-4 text-lg font-bold">
          {rader.length} {rader.length === 1 ? "rad" : "rader"} att skicka
        </h2>
        <ul className="mt-3 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {rader.map((rad) => (
            <li key={rad.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="font-mono font-bold">{rad.artikelnummer}</span>
                {rad.benämning && (
                  <span className="block truncate text-sm text-gray-600">{rad.benämning}</span>
                )}
              </span>
              <span className="shrink-0 text-base font-bold">
                {rad.antal} {rad.enhet}
              </span>
            </li>
          ))}
        </ul>

        <form onSubmit={skicka} className="mt-6">
          {mottagare.length > 0 && (
            <>
              <label htmlFor="mottagare" className="block text-sm font-bold text-gray-700">
                Leverans till
              </label>
              <p className="text-xs text-gray-500">Vilken av era adresser ska godset till?</p>
              <select
                id="mottagare"
                value={mottagarkod}
                onChange={(e) => setMottagarkod(e.target.value)}
                required
                className="mt-1 min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-base outline-none focus:border-gohlins"
              >
                <option value="">Välj adress…</option>
                {mottagare.map((m) => (
                  <option key={m.kod} value={m.kod}>
                    {m.namn}
                    {m.adress ? ` – ${m.adress}` : ""}
                  </option>
                ))}
              </select>
              {/* Adressen upprepas under rullgardinen. En vald rad i en select
                  klipps av på smala telefoner, och en avklippt adress är
                  precis det man inte vill missa. */}
              {mottagarkod && (
                <p className="mt-1 text-sm text-gray-600">
                  {mottagare.find((m) => m.kod === mottagarkod)?.adress}
                </p>
              )}
            </>
          )}

          <label htmlFor="referens" className="mt-5 block text-sm font-bold text-gray-700">
            Er referens
          </label>
          <p className="text-xs text-gray-500">Vem hos er gäller ordern?</p>
          <input
            id="referens"
            value={referens}
            onChange={(e) => setReferens(e.target.value)}
            required
            autoComplete="name"
            className="mt-1 min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-base outline-none focus:border-gohlins"
          />

          <label htmlFor="marke" className="mt-5 block text-sm font-bold text-gray-700">
            Märke / ordernummer
          </label>
          <p className="text-xs text-gray-500">Ert eget ordernummer eller märke på godset. Frivilligt.</p>
          <input
            id="marke"
            value={märke}
            onChange={(e) => setMärke(e.target.value)}
            className="mt-1 min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-base outline-none focus:border-gohlins"
          />

          {/* Skicka-knappen ligger fast längst ned: den ska nås utan att
              skrolla förbi tjugo rader. */}
          <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto max-w-md">
              {fel && (
                <p
                  role="alert"
                  className="mb-3 rounded-xl border-l-4 border-gohlins bg-gohlins-ljus px-4 py-3 text-sm text-gray-900"
                >
                  {fel}
                </p>
              )}
              <button
                type="submit"
                disabled={
                  skickar ||
                  rader.length === 0 ||
                  !referens.trim() ||
                  (mottagare.length > 0 && !mottagarkod)
                }
                className="min-h-16 w-full rounded-xl bg-gohlins px-4 text-lg font-bold text-white transition-colors hover:bg-gohlins-mork disabled:opacity-40"
              >
                {skickar ? "Skickar…" : "Skicka ordern"}
              </button>
            </div>
          </div>
        </form>
      </main>
    );
  }

  // ── Raderna ───────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-md px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6">
      {rubrik}

      <button
        type="button"
        onClick={() => {
          setVarning(null);
          setAvslag(null);
          setSkannar(true);
        }}
        className="mt-6 min-h-20 w-full rounded-2xl bg-gohlins px-4 text-xl font-bold text-white transition-colors hover:bg-gohlins-mork"
      >
        Skanna QR-kod
      </button>

      <form onSubmit={läggTillManuellt} className="mt-3 flex gap-2">
        <input
          ref={manuelltFält}
          value={manuellt}
          onChange={(e) => setManuellt(e.target.value)}
          placeholder="…eller skriv artikelnummer"
          autoCapitalize="characters"
          autoCorrect="off"
          className="min-h-14 min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-base outline-none focus:border-gohlins"
        />
        <button
          type="submit"
          disabled={!manuellt.trim()}
          className="min-h-14 shrink-0 rounded-xl border border-gray-300 px-4 font-bold disabled:opacity-40"
        >
          Lägg till
        </button>
      </form>

      {varning && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {varning}
        </p>
      )}

      {rader.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">
          Inga rader än. Skanna hyllkanten så hamnar artikeln här.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rader.map((rad, i) => (
            <li key={rad.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-lg font-bold">{rad.artikelnummer}</span>
                <button
                  type="button"
                  onClick={() => taBort(rad.id)}
                  aria-label={`Ta bort rad ${i + 1}, ${rad.artikelnummer}`}
                  className="shrink-0 text-sm text-gray-500 underline"
                >
                  Ta bort
                </button>
              </div>

              <input
                value={rad.benämning}
                onChange={(e) => ändra(rad.id, { benämning: e.target.value })}
                placeholder="Benämning (fanns inte i koden)"
                className="mt-2 min-h-12 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-gohlins"
              />

              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-gray-600">Antal</span>
                <Antalsväljare
                  värde={rad.antal}
                  enhet={rad.enhet}
                  onÄndra={(antal) => ändra(rad.id, { antal })}
                  onEnhet={(enhet) => ändra(rad.id, { enhet })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => setVy("utcheckning")}
            disabled={rader.length === 0}
            className="min-h-16 w-full rounded-xl bg-gray-900 px-4 text-lg font-bold text-white disabled:opacity-30"
          >
            Checka ut
            {rader.length > 0 && ` · ${rader.length} ${rader.length === 1 ? "rad" : "rader"}`}
          </button>
        </div>
      </div>

      {skannar && (
        <Skanner
          onKod={skannad}
          onStäng={() => {
            setSkannar(false);
            setSenaste(null);
            setAvslag(null);
          }}
          pausad={senaste !== null || avslag !== null}
        >
          {senaste ? (
            <Träff
              rad={senaste}
              onAntal={(antal) => ändra(senaste.id, { antal })}
              onNästa={() => setSenaste(null)}
              onCheckaUt={() => {
                setSenaste(null);
                setSkannar(false);
                setVy("utcheckning");
              }}
              onÅngra={() => taBort(senaste.id)}
            />
          ) : avslag ? (
            <Avslag
              kod={avslag}
              onIgen={() => setAvslag(null)}
              onFörHand={() => {
                setAvslag(null);
                setSkannar(false);
                setTimeout(() => manuelltFält.current?.focus(), 100);
              }}
            />
          ) : undefined}
        </Skanner>
      )}
    </main>
  );
}

/** Antal med stora plus och minus – det ska gå att träffa med handskar. */
function Antalsväljare({
  värde,
  enhet,
  onÄndra,
  onEnhet,
  stor = false,
}: {
  värde: string;
  enhet: string;
  onÄndra: (antal: string) => void;
  onEnhet?: (enhet: string) => void;
  stor?: boolean;
}) {
  const knapp = stor ? "h-14 w-14 text-2xl" : "h-12 w-12 text-xl";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onÄndra(stega(värde, -1))}
        aria-label="Minska antalet"
        className={`${knapp} shrink-0 rounded-lg border border-gray-300 font-bold text-gray-700`}
      >
        −
      </button>
      <input
        value={värde}
        onChange={(e) => onÄndra(e.target.value)}
        inputMode="decimal"
        aria-label="Antal"
        className={`${stor ? "h-14 w-24 text-2xl" : "h-12 w-20 text-lg"} rounded-lg border border-gray-300 text-center font-bold outline-none focus:border-gohlins`}
      />
      <button
        type="button"
        onClick={() => onÄndra(stega(värde, 1))}
        aria-label="Öka antalet"
        className={`${knapp} shrink-0 rounded-lg border border-gray-300 font-bold text-gray-700`}
      >
        +
      </button>
      {onEnhet ? (
        <input
          value={enhet}
          onChange={(e) => onEnhet(e.target.value)}
          aria-label="Enhet"
          className="h-12 w-16 rounded-lg border border-gray-200 text-center text-base outline-none focus:border-gohlins"
        />
      ) : (
        <span className="text-lg font-bold text-gray-700">{enhet}</span>
      )}
    </div>
  );
}

/**
 * Träffrutan.
 *
 * Den viktigaste ytan i hela appen: här ska kunden på en blick se ATT koden
 * gick hem och VAD den var. Därför bocken, artikelnumret stort, och benämningen
 * under. Ser man inte det skannar man samma dekal igen för säkerhets skull.
 */
function Träff({
  rad,
  onAntal,
  onNästa,
  onCheckaUt,
  onÅngra,
}: {
  rad: Rad;
  onAntal: (antal: string) => void;
  onNästa: () => void;
  onCheckaUt: () => void;
  onÅngra: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">
            Träff på koden
          </p>
          <p className="font-mono text-2xl font-bold break-all">{rad.artikelnummer}</p>
          <p className="text-base text-gray-700">
            {rad.benämning || <span className="text-gray-400">(ingen benämning i koden)</span>}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-gray-600">Antal</span>
        <Antalsväljare värde={rad.antal} enhet={rad.enhet} onÄndra={onAntal} stor />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onNästa}
          className="min-h-16 rounded-xl bg-gohlins px-3 text-lg font-bold text-white"
        >
          Skanna nästa
        </button>
        <button
          type="button"
          onClick={onCheckaUt}
          className="min-h-16 rounded-xl bg-gray-900 px-3 text-lg font-bold text-white"
        >
          Checka ut
        </button>
      </div>

      <button
        type="button"
        onClick={onÅngra}
        className="mt-3 w-full py-2 text-sm text-gray-500 underline"
      >
        Ta bort raden igen
      </button>
    </div>
  );
}

/**
 * Avslagsrutan.
 *
 * Koden visas i klartext. En kod vi inte kan tolka är oftast fel dekal — en
 * transportetikett, en följesedel — och då är det RÅKODEN som talar om det.
 * Att bara säga "gick inte att läsa" lämnar kunden utan nästa steg.
 */
function Avslag({
  kod,
  onIgen,
  onFörHand,
}: {
  kod: string;
  onIgen: () => void;
  onFörHand: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gohlins-mork">
        Koden gick inte att tolka
      </p>
      <p className="mt-1 font-mono text-sm break-all text-gray-600">{kod}</p>
      <p className="mt-2 text-sm text-gray-700">
        Är det rätt dekal? Vi gissar hellre inte än lägger fel artikel på ordern.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onIgen}
          className="min-h-16 rounded-xl bg-gohlins px-3 text-lg font-bold text-white"
        >
          Försök igen
        </button>
        <button
          type="button"
          onClick={onFörHand}
          className="min-h-16 rounded-xl border border-gray-300 px-3 text-base font-bold text-gray-900"
        >
          Skriv in för hand
        </button>
      </div>
    </div>
  );
}
