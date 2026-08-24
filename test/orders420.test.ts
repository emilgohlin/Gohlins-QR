import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrders420, type OrderOut } from "../src/lib/orders420";
// Den RIKTIGA parsern ur the-brain. Testet är hela poängen med formatvalet:
// kan inläsningen inte läsa vår fil är den värdelös, och det ska ett test säga
// direkt och inte en kollega på måndag morgon.
import { parseMonitorOrder } from "../../the-brain/src/lib/order/parseOrder";
import { DOMParser } from "linkedom";

// Parsern är skriven för webbläsaren och använder DOMParser. Node har ingen, så
// testet lånar in en riktig XML-implementation i stället för att vi skriver om
// parsern för testets skull – det är just den koden i produktion vi vill mäta
// mot. Traverseringen använder bara element och attribut, alltså det xmldom
// täcker – inklusive querySelector, som parsern använder. En skillnad mot
// webbläsarens DOM skulle ligga i sådant parsern ändå inte rör.
(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

const order: OrderOut = {
  orderNumber: "K-1001",
  orderDate: "2026-08-24",
  customerNumber: "26065",
  customerName: "AXELENT AB",
  reference: "Göran Bringsén",
  lines: [
    { articleNumber: "7900696", name: "MAGNET 10x8mm 35N NEODYM", quantity: 20, unit: "st" },
    { articleNumber: "000000032", name: "LÅSBRICKA M8", quantity: 2.5, unit: "kg" },
    { articleNumber: "-6667", name: 'FÄSTE "L" & vinkel <20>', quantity: 1, unit: "st" },
  ],
};

test("the-brains orderinläsning kan läsa vår XML", () => {
  const parsed = parseMonitorOrder(buildOrders420(order));

  assert.equal(parsed.orderNumber, "K-1001");
  assert.equal(parsed.orderDate, "2026-08-24");
  assert.equal(parsed.customerCode, "26065", "kundnummer måste hittas");
  assert.equal(parsed.customerName, "AXELENT AB");
  assert.equal(parsed.buyerReference, "Göran Bringsén", "referensen måste följa med");
  assert.equal(parsed.currency, "SEK");
  assert.equal(parsed.lines.length, 3);
});

test("artikelnummer, antal och enhet kommer fram oförvanskade", () => {
  const { lines } = parseMonitorOrder(buildOrders420(order));

  assert.equal(lines[0].articleNumber, "7900696");
  assert.equal(lines[0].quantity, 20);
  assert.equal(lines[0].unit, "st");
  assert.equal(lines[0].rowType, "1", "radtypen måste vara 1, annars räknas raden inte");

  // Ledande nollor får inte försvinna på vägen – 26 320 artiklar har dem.
  assert.equal(lines[1].articleNumber, "000000032");
  assert.equal(lines[1].quantity, 2.5, "decimalantal måste överleva");

  // Bindestreck i artikelnummer, och specialtecken i benämningen.
  assert.equal(lines[2].articleNumber, "-6667");
  assert.equal(lines[2].text, 'FÄSTE "L" & vinkel <20>', "escapning måste vara reversibel");
});

test("inget pris påstås när vi inte känner priserna", () => {
  const { lines } = parseMonitorOrder(buildOrders420(order));
  // Tomt Each, inte 0.00: ett nollpris hade lästs som en prisavvikelse på 100 %.
  for (const l of lines) assert.equal(l.unitPrice, null);
});

test("en tom order ger en läsbar fil utan rader", () => {
  const parsed = parseMonitorOrder(buildOrders420({ ...order, lines: [] }));
  assert.equal(parsed.lines.length, 0);
  assert.equal(parsed.customerCode, "26065");
});
