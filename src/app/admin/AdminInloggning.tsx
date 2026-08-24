"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminInloggning() {
  const router = useRouter();
  const [namn, setNamn] = useState("");
  const [kod, setKod] = useState("");
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function loggaIn(event: React.FormEvent) {
    event.preventDefault();
    setSkickar(true);
    setFel(null);
    try {
      const res = await fetch("/api/admin/logga-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ namn, kod }),
      });
      const svar = (await res.json()) as { fel?: string };
      if (!res.ok) {
        setFel(svar.fel ?? "Något gick fel.");
        setKod("");
        return;
      }
      router.refresh();
      router.push("/admin/ordrar");
    } catch {
      setFel("Ingen kontakt med servern.");
    } finally {
      setSkickar(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Göhlins order – innesälj</h1>
      <p className="mt-2 text-sm text-gray-600">Kundernas inkomna ordrar.</p>

      <form onSubmit={loggaIn} className="mt-8 space-y-5">
        <div>
          <label htmlFor="namn" className="block text-sm font-medium text-gray-700">
            Namn
          </label>
          <input
            id="namn"
            value={namn}
            onChange={(e) => setNamn(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-gray-900"
          />
        </div>
        <div>
          <label htmlFor="kod" className="block text-sm font-medium text-gray-700">
            Lösenord
          </label>
          <input
            id="kod"
            type="password"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-gray-900"
          />
        </div>

        {fel && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {fel}
          </p>
        )}

        <button
          type="submit"
          disabled={skickar || !namn.trim() || !kod.trim()}
          className="w-full rounded-xl bg-gray-900 px-4 py-3.5 font-medium text-white disabled:opacity-40"
        >
          {skickar ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </main>
  );
}
