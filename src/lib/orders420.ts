// Skriver ordern som Monitor ERP "ORDERS420".
//
// Formatet är valt för att the-brains orderinläsning redan läser det — samma
// parser som tar emot kundernas riktiga affärssystemsordrar
// (src/lib/order/parseOrder.ts i det projektet). När affärssystemskopplingen
// kommer byter vi transportväg, inte format.
//
// Perspektivet i filen: GÖHLINS är Supplier (säljaren), KUNDEN är Buyer.
// Kunden skannar GÖHLINS artikelnummer, så det hamnar i SupplierPartNumber —
// det är fältet inläsningen matchar på. PartNumber är kundens eget nummer och
// lämnas tomt.
//
// test/orders420.test.ts kör resultatet genom den riktiga parsern. Ändra inget
// här utan att det testet går igenom.

/** Göhlins uppgifter i filen. SupplierCodeEdi 6000 är det de riktiga
 *  kundordrarna använder. */
const SUPPLIER = {
  codeEdi: "6000",
  name: "Göhlins i Gnosjö Ab",
  street: "Frejgatan 3",
  zipCity: "335 31 Gnosjö",
  country: "Sverige",
} as const;

export interface OrderLineOut {
  /** Göhlins artikelnummer, som det står i registret. */
  articleNumber: string;
  /** Benämning ur registret – tom sträng om artikeln inte gick att slå upp. */
  name: string;
  quantity: number;
  unit: string;
}

export interface OrderOut {
  /** Vårt eget ordernummer ur appen. */
  orderNumber: string;
  /** YYYY-MM-DD. */
  orderDate: string;
  /** Kundens kundnummer hos Göhlins. */
  customerNumber: string;
  customerName: string;
  /** Referensen kunden fyllde i – personen som ska ha orderbekräftelsen. */
  reference: string;
  /**
   * Kundens eget märke eller ordernummer, tomt när hen inte har något.
   *
   * Går ut som GoodsLabeling/Row1 — fältet Monitor skyltar godset med. Det är
   * rätt plats: märket ska följa med kollit hela vägen, inte bara stå i en
   * kommentar någon läser en gång.
   */
  marking?: string;
  lines: OrderLineOut[];
}

/** &, <, > och citattecken måste bort, annars går filen inte att läsa. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Antal med två decimaler, som i de riktiga filerna ("20.00"). Punkt, inte
 *  komma – det är XML, inte svensk text. */
function qty(n: number): string {
  return n.toFixed(2);
}

export function buildOrders420(order: OrderOut): string {
  const rows = order.lines
    .map((line, i) => {
      // Radnummer i tiosteg, som Monitor gör.
      const rowNumber = (i + 1) * 10;
      return (
        `<Row RowNumber="${rowNumber}" RowType="1">` +
        `<Part PartNumber="" SupplierPartNumber="${esc(line.articleNumber)}" />` +
        `<Text>${esc(line.name)}</Text>` +
        `<ReferenceNumber />` +
        `<Quantity>${qty(line.quantity)}</Quantity>` +
        `<Unit>${esc(line.unit)}</Unit>` +
        `<DeliveryPeriod>${esc(order.orderDate)}</DeliveryPeriod>` +
        // Each lämnas TOM. Vi känner inte priserna – appen är inte kopplad till
        // affärssystemet – och "0.00" hade lästs som ett pris på noll kronor,
        // vilket prisloggen i the-brain skulle rapportera som full avvikelse.
        `<Each />` +
        `<Discount>0.00</Discount>` +
        `<Setup />` +
        `<Alloy>0.00</Alloy>` +
        `</Row>`
      );
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<ORDERS420 SoftwareManufacturer="Göhlins i Gnosjö AB" SoftwareName="Göhlins Kundorder" SoftwareVersion="1">` +
    `<Order OrderNumber="${esc(order.orderNumber)}">` +
    `<Head>` +
    `<Supplier SupplierCodeEdi="${SUPPLIER.codeEdi}">` +
    `<Name>${esc(SUPPLIER.name)}</Name>` +
    `<StreetBox1>${esc(SUPPLIER.street)}</StreetBox1>` +
    `<StreetBox2 />` +
    `<ZipCity1>${esc(SUPPLIER.zipCity)}</ZipCity1>` +
    `<ZipCity2 />` +
    `<Country>${esc(SUPPLIER.country)}</Country>` +
    `</Supplier>` +
    // BuyerCodeEdi är det inläsningen identifierar kunden på.
    `<Buyer BuyerCodeEdi="${esc(order.customerNumber)}">` +
    `<Name>${esc(order.customerName)}</Name>` +
    `<StreetBox1 />` +
    `<StreetBox2 />` +
    `<ZipCity1 />` +
    `<ZipCity2 />` +
    `<Country>Sverige</Country>` +
    `</Buyer>` +
    `<References>` +
    `<BuyerReference>${esc(order.reference)}</BuyerReference>` +
    `<BuyerComment />` +
    `<GoodsLabeling><Row1>${esc(order.marking ?? "")}</Row1><Row2 /></GoodsLabeling>` +
    `</References>` +
    `<Terms>` +
    `<CustomerInvoiceCode>${esc(order.customerNumber)}</CustomerInvoiceCode>` +
    `<OrderDate>${esc(order.orderDate)}</OrderDate>` +
    `</Terms>` +
    `<Export><Currency>SEK</Currency></Export>` +
    `</Head>` +
    `<Rows>${rows}</Rows>` +
    `</Order>` +
    `</ORDERS420>`
  );
}
