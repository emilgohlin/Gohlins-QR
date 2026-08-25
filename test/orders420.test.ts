import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { buildOrders420, type OrderOut } from "../src/lib/orders420";
import { DOMParser } from "linkedom";

/**
 * Formen på det the-brains parser lämnar ifrån sig, skriven här.
 *
 * Frestelsen är att importera ParsedOrder från the-brain i stället. Gör man det
 * kopplas VÅRT BYGGE till att grannprojektet finns på disken — och det gör det
 * inte på en byggmaskin, eller i en färsk klon. Bygget föll på just det.
 *
 * Kopplingen som betyder något är ändå körningen: testet laddar och kör
 * parsern på riktigt längre ned. Glider formatet isär fallerar assertionerna,
 * vilket är precis vad testet finns för. En delad typ hade fångat samma sak en
 * aning tidigare, till priset av att projekten inte längre går att bygga var
 * för sig — och att de är åtskilda är avsiktligt.
 */
interface ParsedOrder {
  orderNumber: string | null;
  orderDate: string | null;
  currency: string | null;
  customerCode: string | null;
  customerName: string | null;
  buyerReference: string | null;
  deliveryName: string | null;
  lines: {
    articleNumber: string | null;
    text: string | null;
    quantity: number | null;
    unit: string | null;
    rowType: string | null;
    unitPrice: number | null;
  }[];
}

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

test("kundens märke hamnar i GoodsLabeling", () => {
  // Row1 är fältet Monitor skyltar godset med – märket ska följa med kollit,
  // inte bara stå i en kommentar någon läser en gång.
  const xml = buildOrders420({ ...order, marking: "IO-4471" });
  assert.ok(xml.includes("<Row1>IO-4471</Row1>"), xml);
  // Utan märke ska taggen vara tom, inte innehålla "undefined".
  assert.ok(buildOrders420(order).includes("<Row1></Row1>"));
  // Specialtecken måste escapas, annars går filen inte att läsa.
  assert.ok(buildOrders420({ ...order, marking: 'A & B "C"' })
    .includes("<Row1>A &amp; B &quot;C&quot;</Row1>"));
});

test("godsmottagaren läses av orderinläsningen", async () => {
  const parseMonitorOrder = await loadParser();
  const parsed = parseMonitorOrder(
    buildOrders420({
      ...order,
      recipient: {
        code: "2",
        name: "VARBERG Akwel Sweden AB",
        street: "Susvindsvägen 28",
        zipCity: "432 32 Varberg",
      },
    }),
  );
  // deliveryName läses ur Head/DeliveryAddress/Name i the-brains parser.
  // Hamnar blocket fel i trädet blir det här null.
  assert.equal(parsed.deliveryName, "VARBERG Akwel Sweden AB");
  // Resten av ordern får inte påverkas av att blocket lagts till.
  assert.equal(parsed.customerCode, "26065");
  assert.equal(parsed.lines.length, 3);
});

test("utan vald mottagare skrivs inget DeliveryAddress alls", async () => {
  const parseMonitorOrder = await loadParser();
  // Ett tomt block hade lästs som en adress utan namn, vilket är värre än
  // ingen adress: orderinläsningen tror då att ett val gjorts.
  assert.ok(!buildOrders420(order).includes("DeliveryAddress"));
  assert.equal(parseMonitorOrder(buildOrders420(order)).deliveryName, null);
});

test("en tom order ger en läsbar fil utan rader", async () => {
  const parseMonitorOrder = await loadParser();
  const parsed = parseMonitorOrder(buildOrders420({ ...order, lines: [] }));
  assert.equal(parsed.lines.length, 0);
  assert.equal(parsed.customerCode, "26065");
});
