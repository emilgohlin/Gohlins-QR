import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScan, articleKey } from "../src/lib/qr";

const ok = (raw: string) => {
  const r = parseScan(raw);
  assert.equal(r.ok, true, `förväntade träff för ${JSON.stringify(raw)}`);
  return r.ok ? r.value : null!;
};
const fail = (raw: string) => {
  const r = parseScan(raw);
  assert.equal(r.ok, false, `förväntade avslag för ${JSON.stringify(raw)}`);
};

test("bara artikelnummer", () => {
  assert.deepEqual(ok("7900696").articleNumber, "7900696");
  assert.equal(ok("7900696").quantity, null);
  // Ledande nollor bevaras – registret har 26 320 sådana artiklar.
  assert.equal(ok("000000032").articleNumber, "000000032");
});

test("artikelnummer med antal, alla separatorer", () => {
  for (const raw of ["7900696*10", "7900696;10", "7900696|10", "7900696\t10", "7900696 10"]) {
    const v = ok(raw);
    assert.equal(v.articleNumber, "7900696", raw);
    assert.equal(v.quantity, 10, raw);
  }
});

test("bindestreck, snedstreck och plus är INTE separatorer", () => {
  // 74 artiklar innehåller bindestreck, en innehåller / och +.
  assert.equal(ok("-6667").articleNumber, "-6667");
  assert.equal(ok("-6667").quantity, null);
  assert.equal(ok("NK26/16+IR22").articleNumber, "NK26/16+IR22");
  assert.equal(ok("NK26/16+IR22").quantity, null);
  // …och de fungerar tillsammans med ett riktigt separerat antal.
  const v = ok("NK26/16+IR22*4");
  assert.equal(v.articleNumber, "NK26/16+IR22");
  assert.equal(v.quantity, 4);
});

test("decimaltal med både komma och punkt", () => {
  assert.equal(ok("7900696*2.5").quantity, 2.5);
  assert.equal(ok("7900696;2.5").quantity, 2.5);
  // Komma är decimaltecken, inte separator – därför fungerar båda skrivsätten.
  assert.equal(ok("7900696*2,5").quantity, 2.5);
  assert.equal(ok("7900696;2,5").quantity, 2.5);
});

test("extra blanksteg spelar ingen roll", () => {
  const v = ok("  7900696 ; 10  ");
  assert.equal(v.articleNumber, "7900696");
  assert.equal(v.quantity, 10);
});

test("gissar aldrig ett antal", () => {
  fail("");
  fail("   ");
  // Två tal efter artikelnumret går inte att skilja åt: är antalet 10 eller 3?
  fail("7900696*10*3");
  fail("7900696*0");       // noll är inget beställt antal
  fail("7900696*-5");      // negativt antal
  fail("7900696*2,5*4");   // decimaltal räknas också som tal
  // Fyra fält är inget format vi känner igen.
  fail("7900696*Skruv*4*extra");
});

test("benämning läses ur koden", () => {
  const v = ok("7900696*Skruv M8 x 40*4");
  assert.equal(v.articleNumber, "7900696");
  assert.equal(v.name, "Skruv M8 x 40");
  assert.equal(v.quantity, 4);
  // Fälten identifieras på vad de är, inte på ordningen.
  const bak = ok("7900696*4*Skruv M8 x 40");
  assert.equal(bak.name, "Skruv M8 x 40");
  assert.equal(bak.quantity, 4);
  // Benämning utan antal – kunden fyller i antalet i appen.
  const utan = ok("7900696;Kabelsko 6 mm");
  assert.equal(utan.name, "Kabelsko 6 mm");
  assert.equal(utan.quantity, null);
  // Bara nummer: ingen benämning, och det är inte ett fel.
  assert.equal(ok("7900696").name, null);
});

test("blanksteg i benämningen överlever separatorn", () => {
  // Blanksteg delar bara koden när ingen riktig separator finns. Annars hade
  // varje benämning gått sönder i delar och koden avslagits.
  const v = ok("7900696*Vinkelfäste 90 grader");
  assert.equal(v.articleNumber, "7900696");
  assert.equal(v.name, "Vinkelfäste 90 grader");
  // Enheten i benämningen får innehålla decimaltal utan att bli ett antal.
  assert.equal(ok("7900696|Rör 2,5 m").name, "Rör 2,5 m");
  assert.equal(ok("7900696|Rör 2,5 m").quantity, null);
  // Utan separator delas koden vid FÖRSTA blanksteget och inte fler.
  assert.equal(ok("7900696 Skruv M8 x 40").name, "Skruv M8 x 40");
  assert.equal(ok("7900696 Skruv M8 x 40").quantity, null);
});

test("JSON-etiketter läses också", () => {
  const v = ok('{"artikelnummer":"7900696","antal":12,"benämning":"Skruv M8"}');
  assert.equal(v.articleNumber, "7900696");
  assert.equal(v.quantity, 12);
  assert.equal(v.name, "Skruv M8");
  assert.equal(ok('{"artnr":"7900696"}').quantity, null);
  // Trasig JSON ska inte krascha; den behandlas som text och avslås.
  fail("{trasig");
});

test("skräpkoder avslås i stället för att bli artikelnummer", () => {
  // Kunden skannar förr eller senare fel dekal.
  fail("https://gohlins.se/produkt/7900696");
  fail("{trasig");
  fail("SSCC:00370123456789012345");
  fail("(01)07350012340006");
});

test("råkoden sparas alltid", () => {
  assert.equal(ok("7900696*10").raw, "7900696*10");
});

test("uppslagsnyckeln normaliserar ledande nollor", () => {
  assert.equal(articleKey("000000032"), "32");
  assert.equal(articleKey("32"), "32");
  // Bokstäver och bindestreck rörs inte.
  assert.equal(articleKey("-6667"), "-6667");
  assert.equal(articleKey("nk26/16"), "NK26/16");
});

test("den märkta dekalen – formatet som gäller i skarp drift", () => {
  // Båda är riktiga dekaler ur hyllan, inte påhittade exempel. De står här för
  // att formatet ska gå att känna igen när någon läser testet om två år.
  const v = ok("[ARTNR]BV025[BEN]BATTERIVATTEN 25L[ANTAL]1[ENH]ST");
  assert.equal(v.articleNumber, "BV025");
  assert.equal(v.name, "BATTERIVATTEN 25L");
  assert.equal(v.quantity, 1);
  assert.equal(v.unit, "ST");

  // Benämningen bär ett bindestreck. Att fälten är namngivna gör att det inte
  // spelar någon roll – i separatorformen hade varje sådant tecken varit en
  // fråga om det delar koden eller hör till värdet.
  const b = ok("[ARTNR]KQ2P04[BEN]BLINDPLUGG KQ2P-04[ANTAL]10[ENH]ST");
  assert.equal(b.articleNumber, "KQ2P04");
  assert.equal(b.name, "BLINDPLUGG KQ2P-04");
  assert.equal(b.quantity, 10);
  assert.equal(b.unit, "ST");
});

test("märkta fält är oberoende av ordning, skiftläge och blanksteg", () => {
  // Fälten är namngivna, så ordningen betyder ingenting.
  const v = ok("[ENH]M[ANTAL]2,5[artnr]NK26/16+IR22[ben]Kabel 2,5 mm");
  assert.equal(v.articleNumber, "NK26/16+IR22");
  assert.equal(v.name, "Kabel 2,5 mm");
  assert.equal(v.quantity, 2.5);
  assert.equal(v.unit, "M");
  // Samma fält kan heta olika på olika etikettmallar.
  assert.equal(ok("[ARTIKELNUMMER]BV025[BENÄMNING]Batterivatten").name, "Batterivatten");
});

test("märkta fält som saknas gör inte koden otolkbar", () => {
  // Bara artikelnumret krävs. Resten fyller kunden i.
  const v = ok("[ARTNR]BV025");
  assert.equal(v.articleNumber, "BV025");
  assert.equal(v.name, null);
  assert.equal(v.quantity, null);
  assert.equal(v.unit, null);
  // Ledande nollor bevaras även här.
  assert.equal(ok("[ARTNR]000000032[BEN]Bricka").articleNumber, "000000032");
});

test("en märkt kod som är obegriplig avslås, den tolkas inte på andra sätt", () => {
  // Antalet går inte att läsa – då vet vi inte vad koden betyder.
  fail("[ARTNR]BV025[ANTAL]en pall[ENH]ST");
  // Artikelnumret saknas helt.
  fail("[BEN]BATTERIVATTEN 25L[ANTAL]1");
  // Artikelnumret är ingen artikel.
  fail("[ARTNR]https://gohlins.se/bv025[BEN]Batterivatten");
  // Noll är inget beställt antal, lika lite här som någon annanstans.
  fail("[ARTNR]BV025[ANTAL]0");
});

test("råkoden sparas även för märkta dekaler", () => {
  const raw = "[ARTNR]BV025[BEN]BATTERIVATTEN 25L[ANTAL]1[ENH]ST";
  assert.equal(ok(raw).raw, raw);
});
