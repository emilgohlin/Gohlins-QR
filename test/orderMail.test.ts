import { test } from "node:test";
import assert from "node:assert/strict";
import { orderMailText } from "../src/lib/orderMail";

const order = {
  orderNumber: "K-1001",
  orderDate: "2026-08-24",
  customerNumber: "12345",
  customerName: "Ackwell",
  reference: "Anna Karlsson",
  replyTo: "anna@ackwell.se",
  lines: [
    { articleNumber: "7900696", name: "Skruv M8 x 40", quantity: 4, unit: "st" },
    { articleNumber: "000000032", name: "", quantity: 2.5, unit: "m" },
  ],
};

test("mejlet bär allt innesälj behöver för att lägga in ordern", () => {
  const text = orderMailText(order);
  for (const del of ["Ackwell", "12345", "K-1001", "Anna Karlsson", "anna@ackwell.se"]) {
    assert.ok(text.includes(del), `saknar ${del}`);
  }
  assert.ok(text.includes("7900696"));
  assert.ok(text.includes("Skruv M8 x 40"));
  // Ledande nollor bevaras – de hör till artikelnumret.
  assert.ok(text.includes("000000032"));
});

test("saknad benämning syns som saknad, inte som en tom kolumn", () => {
  // En tom ruta ser ut som ett slarvfel någon glömt fylla i. Här ska det stå
  // varför den är tom: koden bar bara ett nummer.
  assert.ok(orderMailText(order).includes("(ingen benämning i koden)"));
});

test("antal skrivs som en människa skriver dem", () => {
  const text = orderMailText(order);
  // Mejlet läses av en person; "4.00" är maskinformat och hör hemma i XML:en.
  assert.ok(text.includes("4 st"), text);
  assert.ok(text.includes("2,5 m"), text);
});

test("radantalet räknas i singular och plural", () => {
  assert.ok(orderMailText(order).includes("Totalt 2 rader"));
  assert.ok(
    orderMailText({ ...order, lines: order.lines.slice(0, 1) }).includes("Totalt 1 rad."),
  );
});

test("decimaler stryks utan att lämna ett avbrutet tal", () => {
  const rad = (q: number) =>
    orderMailText({ ...order, lines: [{ ...order.lines[0], quantity: q }] })
      .split("\n")
      .find((r) => r.startsWith("1."))!;
  // 2,001 blev tidigare "2," – ett antal som ser ut som en avbruten inmatning.
  assert.ok(rad(2.001).includes("2 st"), rad(2.001));
  assert.ok(rad(4).includes("4 st"), rad(4));
  assert.ok(rad(2.5).includes("2,5 st"), rad(2.5));
  assert.ok(rad(0.25).includes("0,25 st"), rad(0.25));
  assert.ok(rad(100).includes("100 st"), rad(100));
  assert.ok(rad(0.1).includes("0,1 st"), rad(0.1));
});

test("godsmottagare och anteckning står i mejlet", () => {
  const text = orderMailText({
    ...order,
    recipient: {
      code: "2",
      name: "VARBERG Akwel Sweden AB",
      street: "Susvindsvägen 28",
      zipCity: "432 32 Varberg",
    },
    note: "Alla QR-ordrar ska offereras till joakim.svensson@akwel-automotive.se",
  });
  assert.ok(text.includes("Leverans till: 2 – VARBERG Akwel Sweden AB"), text);
  assert.ok(text.includes("Susvindsvägen 28, 432 32 Varberg"), text);
  assert.ok(text.includes("OBS: Alla QR-ordrar ska offereras"), text);
  // Anteckningen ska stå FÖRE brödtexten om appen – en instruktion som hamnar
  // sist läses sist.
  assert.ok(text.indexOf("OBS:") < text.indexOf("Ordern är skannad"), text);
});

test("märket står med när det finns, och saknas annars", () => {
  const med = orderMailText({ ...order, marking: "Projekt Ekhagen" });
  assert.ok(med.includes("Märke/ordernr: Projekt Ekhagen"), med);
  // Utan märke ska ingen tom rad stå kvar – den ser ut som något som glömts.
  const utan = orderMailText({ ...order, marking: undefined });
  assert.ok(!utan.includes("Märke"), utan);
});
