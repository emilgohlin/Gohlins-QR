// Sessionerna: signerade kakor, inget mer.
//
// Ingen sessionstabell behövs — vi behöver bara veta VEM som är inloggad, och
// den uppgiften ryms i kakan. Att den är signerad med SESSION_SECRET är det som
// gör att kunden inte kan skriva om sitt eget kundnummer och beställa i någon
// annans namn.
//
// Kakorna är httpOnly: skript i webbläsaren kommer inte åt dem, inte ens vårt
// eget. De behöver aldrig läsas där.
//
// TVÅ SKILDA KAKOR, en för kund och en för personal. Se sessionCookie.ts för
// varför rollen inte ligger som ett fält i en gemensam kaka.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { SESSION_COOKIE, ADMIN_COOKIE } from "./sessionCookie";

/** En arbetsdag räcker: man loggar in på morgonen och jobbar under dagen. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

interface Utgång {
  /** Unix-sekunder. Kakans egen maxAge går att kringgå av klienten; den här
   *  gör inte det, eftersom den ligger innanför signaturen. */
  exp: number;
}

export interface Session extends Utgång {
  /** customer_accounts.id */
  id: string;
  kundnr: string;
  companyName: string;
}

export interface AdminSession extends Utgång {
  /** staff_accounts.id */
  id: string;
  name: string;
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret()).update(payload).digest("base64url");
}

function encode(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode<T extends Utgång>(token: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  // Längdskillnad får inte kasta – timingSafeEqual kräver samma längd.
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
    if (!data || typeof data.exp !== "number") return null;
    if (data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function sätt(namn: string, data: object): Promise<void> {
  const store = await cookies();
  store.set(namn, encode({ ...data, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }), {
    httpOnly: true,
    sameSite: "lax",
    // I utvecklingsläge körs appen över http, och en secure-kaka hade aldrig
    // satts. I drift är den alltid https.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

async function läs<T extends Utgång>(namn: string): Promise<T | null> {
  const store = await cookies();
  const raw = store.get(namn)?.value;
  return raw ? decode<T>(raw) : null;
}

export async function startSession(
  account: { id: string; kundnr: string; company_name: string },
): Promise<void> {
  await sätt(SESSION_COOKIE, {
    id: account.id,
    kundnr: account.kundnr,
    companyName: account.company_name,
  });
}

export function readSession(): Promise<Session | null> {
  return läs<Session>(SESSION_COOKIE);
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function startAdminSession(
  staff: { id: string; name: string },
): Promise<void> {
  await sätt(ADMIN_COOKIE, { id: staff.id, name: staff.name });
}

export function readAdminSession(): Promise<AdminSession | null> {
  return läs<AdminSession>(ADMIN_COOKIE);
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}

export { SESSION_COOKIE, ADMIN_COOKIE };
