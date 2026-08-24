"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Inloggning() {
  const router = useRouter();
  const [namn, setNamn] = useState("");
  const [pin, setPin] = useState("");
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function loggaIn(event: React.FormEvent) {
    event.preventDefault();
    setSkickar(true);
    setFel(null);
    try {
      const res = await fetch("/api/logga-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ namn, pin }),
      });
      const svar = (await res.json()) as { fel?: string };
      if (!res.ok) {
        setFel(svar.fel ?? "Något gick fel. Försök igen.");
        setPin("");
        return;
      }
      // refresh() först: annars kan serverkomponenten på /bestall läsa den
      // gamla sessionen och skicka tillbaka hit.
      router.refresh();
      router.push("/bestall");
    } catch {
      setFel("Ingen kontakt med servern. Kontrollera uppkopplingen.");
    } finally {
      setSkickar(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Göhlins Kundorder</h1>
      <p className="mt-2 text-gray-600">
        Logga in, skanna hyllkanten och skicka. Så enkelt ska det vara.
      </p>

      <form onSubmit={loggaIn} className="mt-8 space-y-5">
        <div>
          <label htmlFor="namn" className="block text-sm font-medium text-gray-700">
            Företag
          </label>
          <input
            id="namn"
            name="namn"
            value={namn}
            onChange={(e) => setNamn(e.target.value)}
            autoComplete="organization"
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-lg outline-none focus:border-gray-900"
          />
        </div>

        <div>
          <label htmlFor="pin" className="block text-sm font-medium text-gray-700">
            PIN
          </label>
          <input
            id="pin"
            name="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            // Siffertangentbord på telefonen. type="number" undviks med flit:
            // det ger snurrpilar och äter ledande nollor.
            inputMode="numeric"
            autoComplete="current-password"
            type="password"
            required
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-lg tracking-[0.4em] outline-none focus:border-gray-900"
          />
        </div>

        {fel && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {fel}
          </p>
        )}

        <button
          type="submit"
          disabled={skickar || !namn.trim() || !pin.trim()}
          className="w-full rounded-xl bg-gray-900 px-4 py-4 text-lg font-medium text-white disabled:opacity-40"
        >
          {skickar ? "Loggar in…" : "Logga in"}
        </button>
      </form>

      <p className="mt-8 text-sm text-gray-500">
        Saknar du inloggning? Hör av dig till din säljare på Göhlins.
      </p>
    </main>
  );
}
