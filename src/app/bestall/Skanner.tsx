"use client";

// Kameran och QR-avläsningen.
//
// TRE SAKER AVGÖR HASTIGHETEN, och alla tre var fel i första versionen:
//
// 1. UPPLÖSNINGEN. Utan begärd upplösning ger telefonen ofta 640×480. En
//    hyllkantsdekal på armlängds avstånd blir då en handfull suddiga pixlar.
//    Vi ber om 1920×1080 och får det närmaste kameran kan.
//
// 2. VAD SOM AVLÄSES. Att tugga hela bildrutan är dyrt, och dyrast där det
//    märks mest — på en telefon med JavaScript-avkodaren. Vi klipper ut rutan
//    kunden faktiskt siktar med och läser bara den. Mindre yta, fler försök
//    per sekund, och koden hittas snabbare.
//
// 3. TAKTEN. Förr anropades avläsningen 60 gånger i sekunden via
//    requestAnimationFrame. Avkodningen hinner inte, anropen köar och allt blir
//    trögt. Nu ett försök i taget, ca tio per sekund — snabbare i praktiken
//    just för att vi frågar mer sällan.
//
// TVÅ AVLÄSARE: nyare telefoner har BarcodeDetector inbyggt, vilket är
// snabbast och drar minst batteri. Saknas den faller vi tillbaka på zxing, som
// är ren JavaScript och fungerar överallt. Fallbacken laddas först när den
// behövs.
//
// STRÖMMEN DELAS mellan öppningar, se `delad` nedan.

import { useEffect, useRef, useState } from "react";

interface Props {
  onKod: (raw: string) => void;
  onStäng: () => void;
  /**
   * Pausar AVLÄSNINGEN, inte kameran.
   *
   * Efter en träff ska bilden ligga kvar och strömmen fortsätta rulla — då är
   * återupptagningen omedelbar.
   */
  pausad: boolean;
  /** Visas i stället för standardfoten – träffrutan eller avslagsrutan. */
  children?: React.ReactNode;
}

/** Samma kod ignoreras så länge efter en träff. */
const SPÄRR_MS = 2500;

/** Vila mellan avläsningsförsök. Tio i sekunden räcker gott för en hand som
 *  håller en telefon, och lämnar processorn i fred däremellan. */
const TAKT_MS = 100;

/** Sidan på bilden vi avkodar. Större ger inte fler träffar, bara långsammare
 *  avkodning: en QR-kod behöver knappt 300 px för att läsas. */
const AVKODNINGSSIDA = 512;

/**
 * Hur stor del av det synliga som siktet täcker.
 *
 * En liten ruta är bättre än en stor: mindre yta att avkoda, och kunden riktar
 * telefonen mot EN dekal i stället för mot en hylla med fem. Sitter dekalerna
 * tätt är det skillnaden mellan att beställa rätt artikel och grannens.
 *
 * Värdet styr både beskärningen och rutan på skärmen — de räknas ur samma
 * konstant nedan, så de kan inte glida isär. Gjorde de det skulle vi läsa en
 * annan yta än den kunden siktar med, vilket är omöjligt att förstå som
 * användare.
 */
const SIKTE = 0.375;

/**
 * Kameraströmmen, delad mellan öppningar av skannern.
 *
 * Varje getUserMedia är en ny fråga till webbläsaren, och på iOS betyder det
 * ofta en ny dialogruta. Kunden som skannar tjugo artiklar ska inte behöva
 * svara på samma fråga tjugo gånger. Strömmen släpps när sidan lämnas.
 *
 * Priset är att kameralampan lyser så länge fliken är öppen. Det är ett
 * medvetet byte: en lysande lampa är synlig och begriplig, en dialogruta var
 * tredje sekund gör appen oanvändbar.
 */
let delad: MediaStream | null = null;

async function kameraström(): Promise<MediaStream> {
  if (delad?.active) return delad;
  delad = await navigator.mediaDevices.getUserMedia({
    video: {
      // "environment" = kameran på baksidan. ideal och inte exact: en laptop
      // har bara en kamera, och då ska den användas i stället för att fela.
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  return delad;
}

if (typeof window !== "undefined") {
  // pagehide och inte unload: iOS kör aldrig unload när fliken byts.
  window.addEventListener("pagehide", () => {
    delad?.getTracks().forEach((t) => t.stop());
    delad = null;
  });
}

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export default function Skanner({ onKod, onStäng, pausad, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [lampa, setLampa] = useState<boolean | null>(null);

  const onKodRef = useRef(onKod);
  useEffect(() => {
    onKodRef.current = onKod;
  }, [onKod]);

  // Pausläget läses via ref inifrån avläsningsslingan. Låg det i effektens
  // beroenden skulle kameran startas om varje gång en artikel bekräftas.
  const pausadRef = useRef(pausad);
  useEffect(() => {
    pausadRef.current = pausad;
  }, [pausad]);

  useEffect(() => {
    let stoppad = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      let ström: MediaStream;
      try {
        ström = await kameraström();
      } catch (error) {
        setFel(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Kameran är blockerad. Tillåt kameran för sidan i webbläsarens inställningar."
            : "Kameran gick inte att starta. Du kan skriva in artikelnumret för hand i stället.",
        );
        return;
      }
      if (stoppad) return;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = ström;
      // playsInline krävs av iOS, annars öppnas videon i helskärm.
      await video.play().catch(() => {});

      const spår = ström.getVideoTracks()[0];
      // Lampan finns bara på vissa telefoner. Saknas den ska knappen inte visas.
      setLampa(
        "torch" in (spår?.getCapabilities?.() ?? {}) ? false : null,
      );

      const duk = document.createElement("canvas");
      duk.width = duk.height = AVKODNINGSSIDA;
      const rit = duk.getContext("2d", { willReadFrequently: true });
      if (!rit) return;

      /**
       * Klipper ut det kunden ser i siktet.
       *
       * Videon visas med object-cover, alltså beskuren för att fylla skärmen.
       * Räknar vi på hela bildrutan läser vi delar som ligger utanför skärmen —
       * kunden siktar på en dekal och vi letar någon annanstans.
       */
      function rita(): boolean {
        const vb = video!.videoWidth;
        const vh = video!.videoHeight;
        if (!vb || !vh) return false;
        const skala = Math.max(video!.clientWidth / vb, video!.clientHeight / vh);
        const synligB = video!.clientWidth / skala;
        const synligH = video!.clientHeight / skala;
        const sida = Math.min(synligB, synligH) * SIKTE;
        rit!.drawImage(
          video!,
          (vb - sida) / 2,
          (vh - sida) / 2,
          sida,
          sida,
          0,
          0,
          AVKODNINGSSIDA,
          AVKODNINGSSIDA,
        );
        return true;
      }

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      const zxing = detector
        ? null
        : new (await import("@zxing/browser")).BrowserQRCodeReader();
      if (stoppad) return;

      // Ett försök i taget: nästa läggs först när det förra är klart. Det är
      // skillnaden mot requestAnimationFrame, där anropen köade upp sig.
      const läs = async () => {
        if (stoppad) return;
        if (!pausadRef.current && rita()) {
          try {
            if (detector) {
              const koder = await detector.detect(duk);
              if (koder.length) träff(koder[0].rawValue);
            } else {
              träff(zxing!.decodeFromCanvas(duk).getText());
            }
          } catch {
            // Ingen kod i rutan är normalfallet, inte ett fel.
          }
        }
        if (!stoppad) timer = setTimeout(läs, TAKT_MS);
      };
      läs();
    }

    start();

    return () => {
      stoppad = true;
      clearTimeout(timer);
      // Strömmen stoppas INTE här – den delas mellan öppningar. Se `delad`.
    };
  }, []);

  async function växlaLampa() {
    const spår = delad?.getVideoTracks()[0];
    if (!spår) return;
    const på = !lampa;
    try {
      // torch saknas i TypeScripts DOM-typer – lampan är ett tillägg som inte
      // alla webbläsare har, och därför inte med i standardtypen.
      await spår.applyConstraints({
        advanced: [{ torch: på }],
      } as unknown as MediaTrackConstraints);
      setLampa(på);
    } catch {
      setLampa(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {/* Siktet. Måtten kommer ur SIKTE, samma konstant som beskärningen
            använder: rutan på skärmen ÄR den yta som avkodas.
            min(bredd, höjd) genom w+maxW, så rutan förblir kvadratisk oavsett
            om telefonen hålls stående eller liggande. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            style={{ width: `${SIKTE * 100}%`, maxWidth: `${SIKTE * 100}vh` }}
            className={`aspect-square rounded-2xl border-4 shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)] transition-colors ${
              pausad ? "border-white/25" : "border-white/90"
            }`}
          />
        </div>

        {lampa !== null && (
          <button
            type="button"
            onClick={växlaLampa}
            aria-pressed={lampa}
            className={`absolute right-4 top-4 min-h-14 min-w-14 rounded-full text-2xl ${
              lampa ? "bg-white text-gray-900" : "bg-black/50 text-white"
            }`}
          >
            {lampa ? "☀" : "☼"}
          </button>
        )}

        {fel && (
          <p
            role="alert"
            className="absolute inset-x-4 top-4 rounded-xl bg-red-600 px-4 py-3 text-sm text-white"
          >
            {fel}
          </p>
        )}
      </div>

      {/* Foten. pb tar höjd för iPhones hemindikator – utan den hamnar
          knappen delvis under svepfältet och går inte att träffa. */}
      <div className="bg-black px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children ?? (
          <div className="text-center">
            <p className="text-sm text-white/70">
              Håll QR-koden inne i rutan. Bara det som syns där läses av.
            </p>
            <button
              type="button"
              onClick={onStäng}
              className="mt-4 min-h-14 w-full rounded-xl bg-white px-4 text-lg font-bold text-gray-900"
            >
              Klar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
