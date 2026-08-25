"use client";

// Engångsanvisning: lägg appen på hemskärmen.
//
// Poängen är kameran. Safari på iOS frågar om kameratillstånd en gång per
// sidladdning så länge appen körs i webbläsaren; installerad på hemskärmen ges
// tillståndet en gång. Det går inte att programmera bort frågan — men det går
// att tala om hur man blir av med den.
//
// Visas BARA där den hjälper: på iOS, i webbläsarläge, och tills den stängs.
// En anvisning som inte går att stänga är en annons.

import { useEffect, useState } from "react";

const NYCKEL = "gohlins-hemskarmstips-stangt";

export default function Hemskarmstips() {
  const [visa, setVisa] = useState(false);

  useEffect(() => {
    const iOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPad med skrivbordsläge uppger sig vara en Mac; pekpunkterna avslöjar.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installerad =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    let stängt = false;
    try {
      stängt = localStorage.getItem(NYCKEL) === "1";
    } catch {
      // Privat läge kan neka localStorage. Då visas tipset igen, vilket är
      // bättre än att krascha sidan.
    }
    setVisa(iOS && !installerad && !stängt);
  }, []);

  function stäng() {
    setVisa(false);
    try {
      localStorage.setItem(NYCKEL, "1");
    } catch {
      // Se ovan.
    }
  }

  if (!visa) return null;

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-sm">
      <p className="font-bold">Slipp frågan om kameran</p>
      <p className="mt-1 text-gray-600">
        Lägg appen på hemskärmen, så frågar telefonen om kameran en gång i stället
        för varje gång: tryck på <span className="font-bold">Dela</span> nedtill i
        Safari och välj <span className="font-bold">Lägg till på hemskärmen</span>.
      </p>
      <button
        type="button"
        onClick={stäng}
        className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-bold"
      >
        Tack, dölj
      </button>
    </div>
  );
}
