"use client";

// Kameran och QR-avläsningen.
//
// TVÅ AVLÄSARE, med flit. Nyare telefoner har BarcodeDetector inbyggt i
// webbläsaren: den är snabbast, drar minst batteri och kostar inget att ladda
// ner. Saknas den faller vi tillbaka på zxing, som är ren JavaScript och
// fungerar överallt. Fallbacken laddas först när den behövs — annars hade varje
// kund fått hämta ett bibliotek de flesta aldrig använder.
//
// Kunden står i en lagergång med telefonen i ena handen. Därför: ingen
// bekräfta-knapp efter varje skanning, utan en kort spärr som hindrar att samma
// dekal läses tio gånger i sekunden medan kameran vilar på den.

import { useEffect, useRef, useState } from "react";

interface Props {
  onKod: (raw: string) => void;
  onStäng: () => void;
}

/** Samma kod ignoreras så länge efter en träff. Lång nog att hinna flytta
 *  telefonen till nästa dekal, kort nog att man kan skanna samma artikel igen
 *  med flit. */
const SPÄRR_MS = 2500;

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export default function Skanner({ onKod, onStäng }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fel, setFel] = useState<string | null>(null);
  // Callbacken byts varje gång föräldern ritas om. Utan ref hade kameran
  // startats om vid varje skannad rad. Uppdateringen sker i en effekt och inte
  // under renderingen – en ref som skrivs under render kan hinna läsas i fel
  // ordning när React avbryter och gör om en rendering.
  const onKodRef = useRef(onKod);
  useEffect(() => {
    onKodRef.current = onKod;
  }, [onKod]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stoppad = false;
    let rafId = 0;
    let zxingControls: { stop: () => void } | null = null;
    const senaste = new Map<string, number>();

    function träff(raw: string) {
      const nu = Date.now();
      const förra = senaste.get(raw);
      if (förra && nu - förra < SPÄRR_MS) return;
      senaste.set(raw, nu);
      // En knapp vibration är den enda kvittensen som märks när man tittar på
      // hyllan och inte på skärmen.
      navigator.vibrate?.(40);
      onKodRef.current(raw);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // "environment" = kameran på baksidan. ideal och inte exact: en laptop
          // har bara en kamera, och då ska den användas i stället för att fela.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stoppad) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // playsInline krävs av iOS, annars öppnas videon i helskärm.
        await video.play();

        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: ["qr_code"] });
          const läs = async () => {
            if (stoppad) return;
            try {
              const koder = await detector.detect(video);
              if (koder.length) träff(koder[0].rawValue);
            } catch {
              // En enstaka misslyckad bildruta är normalt – fortsätt.
            }
            rafId = requestAnimationFrame(läs);
          };
          rafId = requestAnimationFrame(läs);
        } else {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          if (stoppad) return;
          const reader = new BrowserQRCodeReader();
          zxingControls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) träff(result.getText());
          });
        }
      } catch (error) {
        setFel(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Kameran är blockerad. Tillåt kameran för sidan i webbläsarens inställningar."
            : "Kameran gick inte att starta. Du kan skriva in artikelnumret för hand i stället.",
        );
      }
    }

    start();

    return () => {
      stoppad = true;
      cancelAnimationFrame(rafId);
      zxingControls?.stop();
      // Kameran måste släppas explicit. Görs det inte lyser lampan kvar och
      // telefonen värms tills fliken stängs.
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {/* Siktet. Visar var kameran läser, så kunden vet var dekalen ska hållas. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-3xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
        </div>
        {fel && (
          <p
            role="alert"
            className="absolute inset-x-4 top-4 rounded-xl bg-red-600 px-4 py-3 text-sm text-white"
          >
            {fel}
          </p>
        )}
      </div>

      <div className="bg-black px-6 pt-4 pb-8 text-center">
        <p className="text-sm text-white/70">
          Håll QR-koden på hyllkanten i rutan. Varje kod läggs till som en rad.
        </p>
        <button
          type="button"
          onClick={onStäng}
          className="mt-4 w-full rounded-xl bg-white px-4 py-4 text-lg font-medium text-gray-900"
        >
          Klar
        </button>
      </div>
    </div>
  );
}
