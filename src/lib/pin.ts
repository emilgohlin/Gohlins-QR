// PIN-hantering.
//
// Inloggningen är företagsnamn + PIN, som verksamheten bett om. Ett företagsnamn
// är däremot gissningsbart och en PIN är kort, så gör man inget mer är kontot
// öppet för att provas igenom. Tre saker bär säkerheten i stället:
//
//   1. PIN lagras som scrypt-hash med eget salt per konto — aldrig i klartext,
//      och en läckt databas ger inte inloggningarna.
//   2. Jämförelsen är tidskonstant, så svarstiden inte avslöjar hur nära man är.
//   3. Kontot låses en stund efter upprepade felaktiga försök. Det är det som
//      gör gissning meningslös, och därför den viktigaste av de tre.
//
// scrypt kommer ur Node och kräver inget beroende.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Kortast tillåtna PIN.
 *
 * Fyra siffror är ett medvetet verksamhetsbeslut: kunden står vid en hyllkant
 * med telefonen i ena handen, och en lång kod blir en kod på en lapp bredvid
 * datorn. Priset är att skyddet i praktiken vilar HELT på låset nedan — 10 000
 * möjligheter är i sig inget hinder. Sänk aldrig MAX_FAILED eller LOCK_MINUTES
 * utan att räkna om vad det innebär.
 */
export const MIN_PIN_LENGTH = 4;

/**
 * Längd på koder vi slumpar fram själva.
 *
 * Längre än minimum, och det är ingen motsägelse: minimum är vad vi accepterar
 * när någon väljer själv, det här är vad vi ger när ingen har någon åsikt. En
 * kod kunden aldrig har valt är lika lätt att minnas med sex siffror.
 */
export const GENERATED_PIN_LENGTH = 6;

/** Antal misslyckade försök innan kontot låses. */
export const MAX_FAILED = 5;

/** Hur länge kontot är låst. Lång nog att göra gissning hopplös, kort nog att
 *  en kund som skrivit fel kan jobba vidare efter en kaffe. */
export const LOCK_MINUTES = 15;

export interface PinRecord {
  pin_hash: string;
  pin_salt: string;
}

export async function hashPin(pin: string): Promise<PinRecord> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(pin.trim(), salt, KEY_LENGTH);
  return { pin_hash: key.toString("hex"), pin_salt: salt };
}

export async function verifyPin(
  pin: string,
  record: PinRecord,
): Promise<boolean> {
  const key = await scrypt(pin.trim(), record.pin_salt, KEY_LENGTH);
  const stored = Buffer.from(record.pin_hash, "hex");
  // Längdskillnad får inte kasta – timingSafeEqual kräver samma längd.
  if (stored.length !== key.length) return false;
  return timingSafeEqual(stored, key);
}

/** Slumpar en PIN att ge kunden. Genererad, inte vald: kunder väljer 1234. */
export function generatePin(digits = GENERATED_PIN_LENGTH): string {
  let out = "";
  while (out.length < digits) {
    // Modulo 10 på en byte lutar mot låga siffror (256 = 25×10 + 6), så de sex
    // översta värdena kastas i stället för att snedvrida fördelningen.
    for (const b of randomBytes(digits)) {
      if (b >= 250) continue;
      out += String(b % 10);
      if (out.length === digits) break;
    }
  }
  return out;
}

/**
 * Företagsnamnet omvandlat till inloggningsnamn.
 *
 * "Axelent AB", "axelent ab" och " AXELENTAB " ska alla vara samma konto —
 * kunden minns namnet, inte skrivsättet. Bolagsformen behålls: både "Göhlins AB"
 * och "Göhlins" ska kunna finnas som separata kunder om det någon gång behövs.
 */
export function loginName(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,]/g, "");
}
