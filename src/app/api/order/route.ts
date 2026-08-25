// Tar emot kundens rader, sparar ordern och mejlar den till innesälj.
//
// Ordern sparas FÖRST, med status "utkast", och märks som skickad först när
// mejlet gått iväg. Ordningen är vald med flit: går mejlet fel finns raderna
// ändå kvar med status "misslyckad" och felet i klartext, och då går ordern att
// rädda. Hade vi mejlat först och sparat sedan vore en kraschad order borta,
// och kunden hade fått höra "vi ser ingen beställning".

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { sendMail, mejlKonfigurerat } from "@/lib/graph";
import { buildOrderMail, type MailLine } from "@/lib/orderMail";

interface InkommandeRad {
  articleNumber?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  raw?: string;
}

/** Datum i svensk tidszon. Servern kan stå var som helst; ordern är svensk. */
function orderDatum(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ fel: "Du är utloggad. Logga in igen." }, { status: 401 });
  }

  const body = (await request.json()) as {
    reference?: string;
    marking?: string;
    recipient?: string;
    lines?: InkommandeRad[];
  };
  const reference = body.reference?.trim();
  // Frivilligt: alla kunder har inte ett eget ordernummer, och ett tvingande
  // fält hade fyllts i med ett bindestreck.
  const marking = body.marking?.trim() || null;
  if (!reference) {
    return NextResponse.json({ fel: "Fyll i vem ordern gäller (er referens)." }, { status: 400 });
  }

  const rader: MailLine[] = [];
  const råa: (string | null)[] = [];
  for (const rad of body.lines ?? []) {
    const artikel = rad.articleNumber?.trim();
    const antal = Number(rad.quantity);
    // Servern litar inte på klienten. Formuläret kontrollerar samma saker, men
    // det är den här kontrollen som gäller — en order är pengar.
    if (!artikel || !Number.isFinite(antal) || antal <= 0) {
      return NextResponse.json(
        { fel: "En rad saknar artikelnummer eller antal." },
        { status: 400 },
      );
    }
    rader.push({
      articleNumber: artikel,
      name: rad.name?.trim() ?? "",
      quantity: antal,
      unit: rad.unit?.trim() || "st",
    });
    råa.push(rad.raw ?? null);
  }
  if (!rader.length) {
    return NextResponse.json({ fel: "Ordern är tom." }, { status: 400 });
  }

  // Kontot läses om vid varje order, inte bara vid inloggningen. Sessionen
  // lever i tolv timmar, och ett konto som stängs av ska sluta fungera nu och
  // inte i morgon bitti.
  const { data: konto } = await db()
    .from("customer_accounts")
    .select("contact_email, active, note")
    .eq("id", session.id)
    .maybeSingle();

  if (!konto || !konto.active) {
    return NextResponse.json(
      { fel: "Kontot är avstängt. Kontakta din säljare på Göhlins." },
      { status: 403 },
    );
  }

  // Godsmottagaren slås upp mot kundens EGET register. Klienten skickar bara
  // en kod, och en kod som inte finns hos den här kunden avvisas — annars
  // räcker det att skriva om ett fält i webbläsaren för att leverera till en
  // adress man inte har något med att göra.
  const { data: mottagare } = await db()
    .from("delivery_recipients")
    .select("code, name, street, zip_city")
    .eq("account_id", session.id)
    .eq("active", true)
    .order("sort_order");

  const valdKod = body.recipient?.trim();
  const vald = mottagare?.find((m) => m.code === valdKod) ?? null;

  // Kravet gäller kunder som HAR ett mottagarregister. En kund utan register
  // har ingen adress att välja, och ett obligatoriskt fält utan alternativ är
  // bara en vägg.
  if (mottagare?.length && !vald) {
    return NextResponse.json(
      { fel: "Välj vart leveransen ska." },
      { status: 400 },
    );
  }

  const { data: order, error: orderFel } = await db()
    .from("orders")
    .insert({
      account_id: session.id,
      reference,
      marking,
      // Kopieras hit, precis som benämningen på orderraden: registret ändras
      // över tiden och ordern ska visa vad kunden valde när hen beställde.
      recipient_code: vald?.code ?? null,
      recipient_name: vald?.name ?? null,
      recipient_address: vald
        ? [vald.street, vald.zip_city].filter(Boolean).join(", ")
        : null,
    })
    .select("id, order_number")
    .single();
  if (orderFel || !order) {
    // Samma lärdom som i inloggningarna: ett databasfel som bara blir "försök
    // igen" mot kunden och tystnad i loggen är det dyraste felet att leta
    // efter. En saknad kolumn ser annars ut som en tillfällig strul.
    console.error("Ordern kunde inte sparas", orderFel);
    return NextResponse.json(
      { fel: "Ordern kunde inte sparas. Försök igen." },
      { status: 500 },
    );
  }

  const { error: radFel } = await db().from("order_lines").insert(
    rader.map((rad, i) => ({
      order_id: order.id,
      article_number: rad.articleNumber,
      article_name: rad.name,
      unit: rad.unit,
      quantity: rad.quantity,
      raw_scan: råa[i],
      sort_order: i,
    })),
  );
  if (radFel) {
    console.error("Orderraderna kunde inte sparas", radFel);
    return NextResponse.json({ fel: "Raderna kunde inte sparas." }, { status: 500 });
  }

  // process.env och inte env.orderEmailTo(): saknas adressen ska vi hamna i
  // grenen nedan som sparar ordern och loggar mejlet, inte kasta ett 500 som
  // lämnar ordern som "utkast" utan spår av varför.
  const till = (process.env.ORDER_EMAIL_TO ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const mail = buildOrderMail(
    {
      orderNumber: order.order_number,
      orderDate: orderDatum(),
      customerNumber: session.kundnr,
      customerName: session.companyName,
      reference,
      marking: marking ?? undefined,
      recipient: vald
        ? { code: vald.code, name: vald.name, street: vald.street, zipCity: vald.zip_city }
        : undefined,
      note: konto?.note ?? undefined,
      replyTo: konto?.contact_email ?? undefined,
      lines: rader,
    },
    till,
  );

  // FRÅN OCH MED HÄR ÄR ORDERN FRAMME.
  //
  // Raderna ligger i databasen och syns i adminvyn, där innesälj lägger in dem
  // i affärssystemet och kvitterar. Mejlet är en bekvämlighet ovanpå det, inte
  // vägen in. Därför får kunden ett lyckat besked oavsett hur det går med
  // utskicket — allt annat vore att larma om ett fel som inte drabbar hen.
  //
  // Statusen på ordern berättar däremot hela sanningen, för det är innesälj som
  // behöver veta om mejlet gick fram eller inte.
  const kvitto = NextResponse.json({ ok: true, ordernummer: order.order_number });
  // XML:en som faktiskt byggdes sparas oavsett utfall, inte en återskapning.
  // Uppstår en tvist om vad som beställdes är det den här som gäller.
  const xml = mail.attachments?.[0].content;

  if (!mejlKonfigurerat()) {
    // Ordern är MOTTAGEN, inte misslyckad: ingenting har gått fel, ett steg är
    // bara inte påslaget. Mejlet skrivs i loggen så innehållet går att granska.
    console.info(
      `\n─── Ordermejl som INTE skickades (avsändaren är inte konfigurerad) ───\n` +
        `Till: ${till.join(", ")}\nÄmne: ${mail.subject}\n\n${mail.text}\n` +
        `─── Bilaga ${mail.attachments?.[0].filename} ───\n${xml}\n`,
    );
    await db().from("orders").update({ status: "mottagen", xml }).eq("id", order.id);
    return kvitto;
  }

  try {
    await sendMail(mail);
  } catch (error) {
    // Ett mejl som försöktes och inte gick fram ÄR ett fel, till skillnad från
    // ett utskick som aldrig var påslaget. Det ska synas rött i adminvyn med
    // orsaken i klartext — annars vet ingen varför.
    await db()
      .from("orders")
      .update({ status: "misslyckad", error: String(error), xml })
      .eq("id", order.id);
    console.error("Ordermejl misslyckades", error);
    return kvitto;
  }

  await db()
    .from("orders")
    .update({
      status: "skickad",
      sent_at: new Date().toISOString(),
      email_to: till.join(", "),
      xml,
    })
    .eq("id", order.id);

  return kvitto;
}
