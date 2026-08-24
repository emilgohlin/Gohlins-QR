// Ordermejlet till innesälj.
//
// Två delar, med olika mottagare i tanken: radlistan i mejlkroppen är för
// MÄNNISKAN som ska lägga in ordern, XML-bilagan är för MASKINEN som ska läsa
// den när affärssystemskopplingen kommer. Samma uppgifter, två format — den som
// bara läser mejlet ska aldrig behöva öppna bilagan.
//
// Funktionerna är rena och tar allt de behöver som argument, så de går att
// testa utan vare sig databas eller mejlserver.

import { buildOrders420, type OrderOut } from "./orders420";
import type { Mail } from "./graph";

export interface MailLine {
  articleNumber: string;
  /** Benämning ur QR-koden. Tom när koden bara bar ett nummer. */
  name: string;
  quantity: number;
  unit: string;
}

export interface OrderMailInput {
  orderNumber: string;
  orderDate: string;
  customerNumber: string;
  customerName: string;
  reference: string;
  /** Kundens mejladress, dit innesälj svarar. */
  replyTo?: string;
  lines: MailLine[];
}

/** Antal utan onödiga decimaler: "4" och "2,5", inte "4.00". Mejlet läses av en
 *  människa; XML:en är den som ska ha maskinformatet. */
function qty(n: number): string {
  return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "")).replace(".", ",");
}

export function orderMailText(order: OrderMailInput): string {
  const rows = order.lines.map((line, i) => ({
    nr: String(i + 1),
    art: line.articleNumber,
    // Saknas benämningen ska det SYNAS att den saknas, inte se ut som en tom
    // kolumn någon glömt fylla i. Koden bar bara ett nummer.
    name: line.name || "(ingen benämning i koden)",
    qty: `${qty(line.quantity)} ${line.unit}`,
  }));

  const w = (key: "nr" | "art" | "name") =>
    Math.max(...rows.map((r) => r[key].length), key === "art" ? 12 : 0);
  const [wNr, wArt, wName] = [w("nr"), w("art"), w("name")];

  const table = [
    `${"".padEnd(wNr)}  ${"ARTIKELNR".padEnd(wArt)}  ${"BENÄMNING".padEnd(wName)}  ANTAL`,
    ...rows.map(
      (r) => `${r.nr.padStart(wNr)}. ${r.art.padEnd(wArt)}  ${r.name.padEnd(wName)}  ${r.qty}`,
    ),
  ].join("\n");

  return [
    `Ny kundorder från ${order.customerName} (kundnr ${order.customerNumber}).`,
    "",
    `Ordernummer:  ${order.orderNumber}`,
    `Datum:        ${order.orderDate}`,
    `Er referens:  ${order.reference}`,
    ...(order.replyTo ? [`Mejl:         ${order.replyTo}`] : []),
    "",
    table,
    "",
    `Totalt ${order.lines.length} ${order.lines.length === 1 ? "rad" : "rader"}.`,
    "",
    "Ordern är skannad av kunden i Göhlins Kundorder. Artikelnummer och",
    "benämning kommer ur QR-koden på hyllkanten; priser sätts av er.",
    "ORDERS420-filen är bifogad.",
  ].join("\n");
}

export function buildOrderMail(order: OrderMailInput, to: string[]): Mail {
  const out: OrderOut = {
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    customerNumber: order.customerNumber,
    customerName: order.customerName,
    reference: order.reference,
    lines: order.lines,
  };
  return {
    to,
    // Kundnamnet först i ämnesraden: innesälj sorterar och söker på kund, inte
    // på vårt ordernummer.
    subject: `Kundorder ${order.customerName} – ${order.orderNumber}`,
    text: orderMailText(order),
    replyTo: order.replyTo,
    attachments: [
      {
        filename: `${order.orderNumber}.xml`,
        contentType: "application/xml",
        content: buildOrders420(out),
      },
    ],
  };
}
