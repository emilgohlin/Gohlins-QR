// Sessionen: en signerad kaka, inget mer.
//
// Ingen sessionstabell behövs — vi behöver bara veta VILKEN kund som är
// inloggad, och den uppgiften ryms i kakan. Att den är signerad med
// SESSION_SECRET är det som gör att kunden inte kan skriva om sitt eget
// kundnummer och beställa i någon annans namn.
//
// Kakan är httpOnly: skript i webbläsaren kommer inte åt den, inte ens vårt
// eget. Den behöver aldrig läsas där.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { SESSION_COOKIE } from "./sessionCookie";

const COOKIE = SESSION_COOKIE;

/** En arbetsdag räcker: kunden loggar in på morgonen och beställer under dagen. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

export interface Session {
  /** customer_accounts.id */
  id: string;
  kundnr: string;
  companyName: string;
  /** Unix-sekunder. Kakans egen maxAge går att kringgå av klienten; den här
   *  gör inte det, eftersom den ligger innanför signaturen. */
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret()).update(payload).digest("base64url");
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): Session | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  // Längdskillnad får inte kasta – timingSafeEqual kräver samma längd.
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (!session?.id || typeof session.exp !== "number") return null;
    if (session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function startSession(
  account: { id: string; kundnr: string; company_name: string },
): Promise<void> {
  const session: Session = {
    id: account.id,
    kundnr: account.kundnr,
    companyName: account.company_name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const store = await cookies();
  store.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    // I utvecklingsläge körs appen över http, och en secure-kaka hade aldrig
    // satts. I drift är den alltid https.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  return raw ? decode(raw) : null;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

// Namnet bor i sessionCookie.ts, så proxy.ts kan läsa det utan att dra in
// den här filens serverberoenden.
export { SESSION_COOKIE };
