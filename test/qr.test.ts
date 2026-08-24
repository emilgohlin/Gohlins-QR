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
  fail("7900696*abc");     // andra delen är inget antal
  fail("7900696*10*3");    // tre delar – vi vet inte vad koden betyder
  fail("7900696*0");       // noll är inget beställt antal
  fail("7900696*-5");      // negativt antal
});

test("JSON-etiketter läses också", () => {
  const v = ok('{"artikelnummer":"7900696","antal":12}');
  assert.equal(v.articleNumber, "7900696");
  assert.equal(v.quantity, 12);
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
