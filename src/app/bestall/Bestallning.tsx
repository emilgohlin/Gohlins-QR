"use client";

// Beställningen: raderna kunden skannat, och knappen som skickar dem.
//
// ANTALET SPARAS SOM TEXT och tolkas först när ordern skickas. Det ser
// bakvänt ut, men ett tal i fältet gör det omöjligt att skriva "2,5": så fort
// kunden slagit kommatecknet är strängen inget giltigt tal, och fältet hade
// nollställts mitt i inmatningen.

import { useState } from "react";
import { useRouter } from "next/navigation";
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

interface Props {
  företag: string;
  kundnr: string;
}

function tolkaAntal(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export default function Bestallning({ företag, kundnr }: Props) {
  const router = useRouter();
  const [rader, setRader] = useState<Rad[]>([]);
  const [referens, setReferens] = useState("");
  const [skannar, setSkannar] = useState(false);
  const [manuellt, setManuellt] = useState("");
  const [varning, setVarning] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);
  const [skickad, setSkickad] = useState<string | null>(null);

  function läggTill(raw: string) {
    const resultat = parseScan(raw);
    if (!resultat.ok) {
      // Koden avslås hellre än gissas, men kunden ska se VAD som lästes – annars
      // är felet omöjligt att förstå framför hyllan.
      setVarning(
        resultat.reason === "tom"
          ? "Koden var tom."
          : `Koden gick inte att tolka: "${raw}". Skriv in artikelnumret för hand.`,
      );
      return;
    }
    const { articleNumber, name, quantity, unit } = resultat.value;
    setVarning(
      rader.some((r) => r.artikelnummer === articleNumber)
        ? `${articleNumber} finns redan på ordern – kontrollera antalet.`
        : null,
    );
    setRader((förra) => [
      ...förra,
      {
        id: crypto.randomUUID(),
        artikelnummer: articleNumber,
        benämning: name ?? "",
        // Bar koden inget antal är 1 den enda gissning som inte kan bli för
        // stor, och kunden ändrar den ändå på plats.
        antal: quantity !== null ? String(quantity).replace(".", ",") : "1",
        // Enheten kommer från dekalen när den står där. "st" är bara det svar
        // som stämmer oftast när koden inte säger något.
        enhet: unit ?? "st",
        rå: resultat.value.raw,
      },
    ]);
  }

  function ändra(id: string, ändring: Partial<Rad>) {
    setRader((förra) => förra.map((r) => (r.id === id ? { ...r, ...ändring } : r)));
  }

  function taBort(id: string) {
    setRader((förra) => förra.filter((r) => r.id !== id));
  }

  function läggTillManuellt(event: React.FormEvent) {
    event.preventDefault();
    if (!manuellt.trim()) return;
    läggTill(manuellt.trim());
    setManuellt("");
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
          lines: rader.map((r) => ({
            articleNumber: r.artikelnummer,
            name: r.benämning,
            quantity: tolkaAntal(r.antal),
            unit: r.enhet,
            raw: r.rå,
          })),
        }),
      });
      const svar = (await res.json()) as { fel?: string; ordernummer?: string };
      if (!res.ok || !svar.ordernummer) {
        setFel(svar.fel ?? "Ordern kunde inte skickas.");
        return;
      }
      setSkickad(svar.ordernummer);
      setRader([]);
      setReferens("");
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

  if (skickad) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12 text-center">
        <p className="text-5xl text-gohlins">✓</p>
        <h1 className="mt-4 text-2xl font-semibold">Ordern är skickad</h1>
        <p className="mt-2 text-gray-600">
          Ordernummer <span className="font-medium text-gray-900">{skickad}</span>. Innesälj
          hör av sig om något behöver stämmas av.
        </p>
        <button
          type="button"
          onClick={() => setSkickad(null)}
          className="mt-8 w-full rounded-xl bg-gohlins px-4 py-4 text-lg font-bold text-white transition-colors hover:bg-gohlins-mork"
        >
          Beställ mer
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-40 pt-6">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{företag}</h1>
          <p className="text-sm text-gray-500">Kundnr {kundnr}</p>
        </div>
        <button type="button" onClick={loggaUt} className="text-sm text-gray-500 underline">
          Logga ut
        </button>
      </header>

      <button
        type="button"
        onClick={() => {
          setVarning(null);
          setSkannar(true);
        }}
        className="mt-6 w-full rounded-2xl bg-gohlins px-4 py-6 text-xl font-bold text-white transition-colors hover:bg-gohlins-mork"
      >
        Skanna QR-kod
      </button>

      <form onSubmit={läggTillManuellt} className="mt-3 flex gap-2">
        <input
          value={manuellt}
          onChange={(e) => setManuellt(e.target.value)}
          placeholder="…eller skriv artikelnummer"
          autoCapitalize="characters"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          disabled={!manuellt.trim()}
          className="shrink-0 rounded-xl border border-gray-300 px-4 py-3 font-medium disabled:opacity-40"
        >
          Lägg till
        </button>
      </form>

      {varning && (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {varning}
        </p>
      )}

      {rader.length === 0 ? (
        <p className="mt-10 text-center text-gray-500">
          Inga rader än. Skanna hyllkanten så hamnar artikeln här.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rader.map((rad, i) => (
            <li key={rad.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-lg font-medium">{rad.artikelnummer}</span>
                <button
                  type="button"
                  onClick={() => taBort(rad.id)}
                  aria-label={`Ta bort rad ${i + 1}, ${rad.artikelnummer}`}
                  className="text-sm text-gray-500 underline"
                >
                  Ta bort
                </button>
              </div>

              <input
                value={rad.benämning}
                onChange={(e) => ändra(rad.id, { benämning: e.target.value })}
                placeholder="Benämning (fanns inte i koden)"
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
              />

              <div className="mt-3 flex items-center gap-3">
                <label htmlFor={`antal-${rad.id}`} className="text-sm text-gray-600">
                  Antal
                </label>
                <input
                  id={`antal-${rad.id}`}
                  value={rad.antal}
                  onChange={(e) => ändra(rad.id, { antal: e.target.value })}
                  inputMode="decimal"
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg outline-none focus:border-gray-900"
                />
                <input
                  value={rad.enhet}
                  onChange={(e) => ändra(rad.id, { enhet: e.target.value })}
                  aria-label="Enhet"
                  className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm outline-none focus:border-gray-900"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Referens och skicka ligger fast längst ned: kunden ska nå dem utan att
          skrolla förbi tjugo rader. */}
      <form
        onSubmit={skicka}
        className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pb-6 pt-4 backdrop-blur"
      >
        <div className="mx-auto max-w-md">
          {fel && (
            <p role="alert" className="mb-3 rounded-xl border-l-4 border-gohlins bg-gohlins-ljus px-4 py-3 text-sm text-gray-900">
              {fel}
            </p>
          )}
          <input
            value={referens}
            onChange={(e) => setReferens(e.target.value)}
            placeholder="Er referens – vem gäller ordern?"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-900"
          />
          <button
            type="submit"
            disabled={skickar || rader.length === 0 || !referens.trim()}
            className="mt-3 w-full rounded-xl bg-gohlins px-4 py-4 text-lg font-bold text-white transition-colors hover:bg-gohlins-mork disabled:opacity-40"
          >
            {skickar
              ? "Skickar…"
              : `Skicka ${rader.length || ""} ${rader.length === 1 ? "rad" : "rader"}`.trim()}
          </button>
        </div>
      </form>

      {skannar && <Skanner onKod={läggTill} onStäng={() => setSkannar(false)} />}
    </main>
  );
}
