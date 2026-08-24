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
    .select("contact_email, active")
    .eq("id", session.id)
    .maybeSingle();

  if (!konto || !konto.active) {
    return NextResponse.json(
      { fel: "Kontot är avstängt. Kontakta din säljare på Göhlins." },
      { status: 403 },
    );
  }

  const { data: order, error: orderFel } = await db()
    .from("orders")
    .insert({ account_id: session.id, reference, marking })
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
      replyTo: konto?.contact_email ?? undefined,
      lines: rader,
    },
    till,
  );

  if (!mejlKonfigurerat()) {
    // Avsändarpostlådan är inte uppsatt än. Ordern sparas ändå — allt utom
    // sista steget ska gå att köra skarpt — men den märks INTE som skickad.
    // Att skriva "skickad" på en order som ingen fått vore den enda lögn
    // systemet kan berätta som ingen upptäcker förrän leveransen uteblir.
    console.info(
      `\n─── Ordermejl som INTE skickades (avsändaren är inte konfigurerad) ───\n` +
        `Till: ${till.join(", ")}\nÄmne: ${mail.subject}\n\n${mail.text}\n` +
        `─── Bilaga ${mail.attachments?.[0].filename} ───\n${mail.attachments?.[0].content}\n`,
    );
    await db()
      .from("orders")
      .update({
        status: "misslyckad",
        error: "Mejlutskicket är inte konfigurerat (GRAPH_* saknas).",
        xml: mail.attachments?.[0].content,
      })
      .eq("id", order.id);
    return NextResponse.json(
      {
        fel:
          `Ordern är sparad som ${order.order_number}, men mejlutskicket är inte ` +
          "påslaget än. Ring oss så tar vi den för hand.",
      },
      { status: 503 },
    );
  }

  try {
    await sendMail(mail);
  } catch (error) {
    // Felet sparas i klartext på ordern. Utan det är allt vi vet att något gick
    // fel, och en order som ska räddas manuellt behöver veta varför.
    await db()
      .from("orders")
      .update({ status: "misslyckad", error: String(error), xml: mail.attachments?.[0].content })
      .eq("id", order.id);
    console.error("Ordermejl misslyckades", error);
    return NextResponse.json(
      {
        fel:
          `Ordern är sparad som ${order.order_number}, men mejlet gick inte iväg. ` +
          "Ring oss gärna så tar vi den för hand.",
      },
      { status: 502 },
    );
  }

  await db()
    .from("orders")
    .update({
      status: "skickad",
      sent_at: new Date().toISOString(),
      email_to: till.join(", "),
      // Filen som FAKTISKT mejlades sparas, inte en återskapning. Uppstår en
      // tvist om vad som beställdes är det den här som gäller.
      xml: mail.attachments?.[0].content,
    })
    .eq("id", order.id);

  return NextResponse.json({ ok: true, ordernummer: order.order_number });
}
