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
