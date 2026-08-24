import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin, generatePin, loginName, MIN_PIN_LENGTH } from "../src/lib/pin";

test("rätt PIN godkänns, fel avvisas", async () => {
  const rec = await hashPin("471102");
  assert.equal(await verifyPin("471102", rec), true);
  assert.equal(await verifyPin("471103", rec), false);
  assert.equal(await verifyPin("", rec), false);
  // Blanksteg runt om ska inte fälla någon som klistrat in koden.
  assert.equal(await verifyPin("  471102  ", rec), true);
});

test("PIN lagras aldrig i klartext, och två konton med samma PIN får olika hash", async () => {
  const a = await hashPin("471102");
  const b = await hashPin("471102");
  assert.ok(!a.pin_hash.includes("471102"));
  assert.notEqual(a.pin_salt, b.pin_salt, "saltet måste vara unikt per konto");
  assert.notEqual(a.pin_hash, b.pin_hash, "samma PIN får inte ge samma hash");
  // …och båda ska ändå gå att verifiera.
  assert.equal(await verifyPin("471102", b), true);
});

test("en trasig hash kraschar inte", async () => {
  assert.equal(await verifyPin("471102", { pin_hash: "abc", pin_salt: "x" }), false);
  assert.equal(await verifyPin("471102", { pin_hash: "", pin_salt: "" }), false);
});

test("genererade PIN-koder har rätt längd och bara siffror", () => {
  for (let i = 0; i < 50; i++) {
    const pin = generatePin();
    assert.equal(pin.length, MIN_PIN_LENGTH);
    assert.match(pin, /^\d+$/);
  }
  assert.equal(generatePin(8).length, 8);
  // Alla tio siffrorna ska förekomma över många dragningar – annars är
  // slumpen skev och nyckelrummet mindre än det ser ut.
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) for (const c of generatePin()) seen.add(c);
  assert.equal(seen.size, 10, "alla siffror 0–9 måste kunna förekomma");
});

test("inloggningsnamnet tål hur kunden skriver", () => {
  assert.equal(loginName("Axelent AB"), "axelentab");
  assert.equal(loginName("axelent ab"), "axelentab");
  assert.equal(loginName("  AXELENTAB "), "axelentab");
  assert.equal(loginName("Ahlgren AB, Thor"), "ahlgrenabthor");
  // Svenska tecken behålls – de är en del av namnet.
  assert.equal(loginName("Göhlins i Gnosjö AB"), "göhlinsignosjöab");
});
