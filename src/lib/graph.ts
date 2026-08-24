// Skickar mejl via Microsoft 365 (Graph).
//
// Vägen är client credentials: appregistreringen i Entra ID har rättigheten
// Mail.Send (application) och mejlet skickas SOM postlådan i ORDER_EMAIL_FROM.
// Fördelen mot SMTP är att det inte finns något lösenord till en riktig
// postlåda i drift — hemligheten går att rullas i Entra utan att någon byter
// lösenord, och rättigheten kan begränsas till just den ena postlådan med en
// application access policy i Exchange.
//
// Inget SDK: två fetch-anrop är hela protokollet, och ett beroende till hade
// varit mer att hålla uppdaterat än att skriva.

import "server-only";
import { env } from "./env";

interface Token {
  value: string;
  /** Unix-millisekunder. */
  expiresAt: number;
}

let cached: Token | null = null;

async function accessToken(): Promise<string> {
  // Token lever en timme. Att hämta en ny per mejl vore ett extra anrop mellan
  // kunden och kvittensen, i det ögonblick hen väntar som mest.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const url = `https://login.microsoftonline.com/${env.graphTenantId()}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.graphClientId(),
      client_secret: env.graphClientSecret(),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    // Svaret från Microsoft innehåller felkoden (AADSTS…) som säger vad som är
    // fel. Den vill vi ha i loggen, annars är felsökningen gissning.
    throw new Error(`Token från Microsoft nekades (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cached.value;
}

export interface Attachment {
  filename: string;
  /** MIME-typ, t.ex. "application/xml". */
  contentType: string;
  content: string;
}

export interface Mail {
  to: string[];
  subject: string;
  /** Ren text. Formateras som HTML av avsändaren nedan. */
  text: string;
  replyTo?: string;
  attachments?: Attachment[];
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = env.orderEmailFrom();
  const token = await accessToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          // Text, inte HTML: innehållet är en orderlista och ska se likadan ut
          // i varje klient. <pre> bevarar kolumnerna.
          body: { contentType: "HTML", content: `<pre style="font-family:monospace">${escapeHtml(mail.text)}</pre>` },
          toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
          // Innesälj svarar kunden direkt från mejlet.
          replyTo: mail.replyTo
            ? [{ emailAddress: { address: mail.replyTo } }]
            : undefined,
          attachments: mail.attachments?.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.contentType,
            contentBytes: Buffer.from(a.content, "utf8").toString("base64"),
          })),
        },
        // Ordermejlen ska ligga kvar i Skickat på avsändarpostlådan, så det går
        // att se vad som faktiskt gick ut.
        saveToSentItems: true,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Graph avvisade mejlet (${res.status}): ${await res.text()}`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
