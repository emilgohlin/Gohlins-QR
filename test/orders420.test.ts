import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { buildOrders420, type OrderOut } from "../src/lib/orders420";
import type { ParsedOrder } from "../../the-brain/src/lib/order/parseOrder";
import { DOMParser } from "linkedom";

// Parsern är skriven för webbläsaren och använder DOMParser. Node har ingen, så
// testet lånar in en riktig XML-implementation i stället för att vi skriver om
// parsern för testets skull – det är just den koden i produktion vi vill mäta
// mot. linkedom täcker element, attribut och querySelector, alltså allt parsern
// rör.
(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

/**
 * Laddar the-brains RIKTIGA orderparser.
 *
 * De två projekten är avsiktligt skilda åt, så sökvägen är en lös koppling.
 * Ligger the-brain inte bredvid går den att peka ut med THE_BRAIN_PATH.
 *
 * Saknas den FALLERAR testet, det hoppas inte över. Ett tyst överhoppat test
 * hade sett grönt ut medan formatet gled isär, och hela poängen med testet är
 * att fånga just den glidningen.
 */
let cached: ((xml: string) => ParsedOrder) | null = null;
async function loadParser(): Promise<(xml: string) => ParsedOrder> {
  if (cached) return cached;
  const root =
    process.env.THE_BRAIN_PATH ?? path.resolve(__dirname, "../../the-brain");
  const file = path.join(root, "src", "lib", "order", "parseOrder.ts");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Hittar inte the-brains orderparser på ${file}.\n` +
        `XML:en måste kunna läsas av orderinläsningen, och det går inte att ` +
        `kontrollera utan den.\nPeka ut projektet med THE_BRAIN_PATH=/sökväg/till/the-brain npm test`,
    );
  }
  const mod = (await import(pathToFileURL(file).href)) as {
    parseMonitorOrder: (xml: string) => ParsedOrder;
  };
  cached = mod.parseMonitorOrder;
  return cached;
}

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

test("the-brains orderinläsning kan läsa vår XML", async () => {
  const parseMonitorOrder = await loadParser();
  const parsed = parseMonitorOrder(buildOrders420(order));

  assert.equal(parsed.orderNumber, "K-1001");
  assert.equal(parsed.orderDate, "2026-08-24");
  assert.equal(parsed.customerCode, "26065", "kundnummer måste hittas");
  assert.equal(parsed.customerName, "AXELENT AB");
  assert.equal(parsed.buyerReference, "Göran Bringsén", "referensen måste följa med");
  assert.equal(parsed.currency, "SEK");
  assert.equal(parsed.lines.length, 3);
});

test("artikelnummer, antal och enhet kommer fram oförvanskade", async () => {
  const parseMonitorOrder = await loadParser();
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

test("inget pris påstås när vi inte känner priserna", async () => {
  const parseMonitorOrder = await loadParser();
  const { lines } = parseMonitorOrder(buildOrders420(order));
  // Tomt Each, inte 0.00: ett nollpris hade lästs som en prisavvikelse på 100 %.
  for (const l of lines) assert.equal(l.unitPrice, null);
});

test("en tom order ger en läsbar fil utan rader", async () => {
  const parseMonitorOrder = await loadParser();
  const parsed = parseMonitorOrder(buildOrders420({ ...order, lines: [] }));
  assert.equal(parsed.lines.length, 0);
  assert.equal(parsed.customerCode, "26065");
});
