// Tolkar QR-koden på kundens hyllkant.
//
// Koden bär ett artikelnummer, och därtill benämning och/eller ett
// förregistrerat antal av just den artikeln. Benämningen kommer från koden och
// ingen annanstans: appen har inget artikelregister, och utan benämning är en
// felskanning osynlig för kunden ända fram till leveransen.
//
// SKILJETECKNET är valt mot verkligheten, inte gissat. Alla 82 492
// artikelnummer i registret granskades: de består av siffror och bokstäver, och
// de enda skiljetecken som förekommer är bindestreck (74 artiklar, t.ex.
// "-6667"), snedstreck och plus (en artikel: "NK26/16+IR22"). Alltså:
//
//   säkra separatorer   *  ;  |  blanksteg  tabb   – finns i inget artikelnr
//   FÅR INTE användas   -  /  +                    – finns i artikelnummer
//
// Blanksteg är däremot bara NÖDseparator, inte likställd med de andra. En
// benämning innehåller nästan alltid blanksteg ("Skruv M8 x 40"), så vore
// blanksteg en vanlig separator gick varje benämning sönder i flera delar och
// koden avslogs. Bär koden * ; eller | delas den bara på dem.
//
// Kommatecken är medvetet INTE separator, fast det heller inte förekommer i
// något artikelnummer: på svenska etiketter är komma decimaltecken ("2,5 m").
// Vore det separator gick "7900696*2,5" sönder i tre delar och avslogs.
//
// Hittar vi inget vi känner igen gissar vi INTE. Då avslås koden och råkoden
// visas för kunden. En feltolkad siffra är en felaktig order, och en order är
// pengar.

/** Separatorerna som etiketten är tänkt att använda. */
const SEPARATORS = ["*", ";", "|"];
const SEPARATOR_CLASS = /[*;|]/;

/**
 * Tecken ett artikelnummer får bestå av.
 *
 * Hela registret granskades: siffror, bokstäver, och därtill bindestreck (74
 * artiklar), snedstreck, plus och Ä (en artikel vardera). Kontrollen finns för
 * att kunden förr eller senare skannar fel dekal — en URL, en följesedel, en
 * transportetikett. Utan den skulle sådant passera som "artikelnummer" och bli
 * en rad i ordern.
 */
const ARTICLE_CHARS = /^[0-9A-Za-zÅÄÖåäö\-/+]+$/;

export interface ScanResult {
  /** Artikelnummer precis som det stod i koden (ledande nollor bevarade). */
  articleNumber: string;
  /** Benämning ur koden, eller null när koden bara bar ett nummer. */
  name: string | null;
  /** Förregistrerat antal, eller null när koden inte bar något. */
  quantity: number | null;
  /** Hela koden, sparas på orderraden så en felskanning kan spåras. */
  raw: string;
}

export type ScanOutcome =
  | { ok: true; value: ScanResult }
  | { ok: false; raw: string; reason: "tom" | "otolkbar" };

/**
 * 26 320 av artiklarna har ledande nollor ("000000032"), så det kunden knappar
 * in för hand ("32") matchar inte strängen i registret. Nyckeln används bara för
 * uppslag – ordern bär alltid kodens egen skrivning.
 */
export function articleKey(number: string): string {
  const t = number.trim().toUpperCase();
  return /^0+\d+$/.test(t) ? t.replace(/^0+/, "") : t;
}

function parseQuantity(text: string): number | null {
  // Både 2,5 och 2.5 – kunden och etiketten kan skriva olika.
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Delar koden i sina fält.
 *
 * Bär koden en riktig separator delas den bara på den, så benämningens
 * blanksteg överlever. Saknas separator delas den på FÖRSTA blanksteget och
 * inte fler: då kan vi inte veta var en benämning slutar och ett antal börjar,
 * och att dela vidare vore att gissa.
 */
function splitFields(text: string): string[] {
  if (SEPARATOR_CLASS.test(text)) {
    return text
      .split(new RegExp("[" + SEPARATORS.map(esc).join("") + "]"))
      .map((p) => p.trim())
      .filter((p) => p !== "");
  }
  const m = /^(\S+)\s+([\s\S]+)$/.exec(text);
  return m ? [m[1], m[2].trim()] : [text];
}

/** Tolkar en skannad QR-kod. */
export function parseScan(raw: string): ScanOutcome {
  const text = raw.trim();
  if (!text) return { ok: false, raw, reason: "tom" };

  // Vissa etikettsystem lägger ut JSON. Läses om den är begriplig, annars faller
  // vi igenom till separatorformen.
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const art = firstString(obj, ["artikelnummer", "artnr", "article", "art", "nr"]);
      if (art && ARTICLE_CHARS.test(art)) {
        const qtyRaw = firstString(obj, ["antal", "quantity", "qty", "mängd"]);
        const name = firstString(obj, [
          "benämning", "benamning", "namn", "beskrivning", "name", "description", "text",
        ]);
        return {
          ok: true,
          value: {
            articleNumber: art,
            name: name ?? null,
            quantity: qtyRaw ? parseQuantity(qtyRaw) : null,
            raw,
          },
        };
      }
    } catch {
      // Ogiltig JSON – behandla som vanlig text.
    }
  }

  const parts = splitFields(text);
  if (parts.length > 3 || !ARTICLE_CHARS.test(parts[0])) {
    return { ok: false, raw, reason: "otolkbar" };
  }
  const articleNumber = parts[0];
  const rest = parts.slice(1);

  if (rest.length === 0) {
    return { ok: true, value: { articleNumber, name: null, quantity: null, raw } };
  }

  // Fälten efter artikelnumret identifieras på vad de ÄR, inte på ordningen:
  // ett antal är ett tal, en benämning är det inte. Då spelar det ingen roll om
  // etiketten skriver "artnr*benämning*antal" eller "artnr*antal*benämning",
  // och vi behöver inte gissa åt något håll.
  const quantities = rest.filter((p) => parseQuantity(p) !== null);
  const names = rest.filter((p) => parseQuantity(p) === null);

  // Två tal går inte att skilja åt – "7900696*10*3" kan lika gärna vara antal
  // 10 som antal 3. Hellre avslag med råkoden synlig än en gissad order.
  if (quantities.length > 1 || names.length > 1) {
    return { ok: false, raw, reason: "otolkbar" };
  }
  // Ett ensamt fält som varken är tal eller rimlig benämning – t.ex.
  // "7900696*-5" – ska inte tyst bli en benämning. Ett minustecken framför en
  // siffra är ett antal som skrivits fel, inte en artikelbenämning.
  if (names.length === 1 && /^[-+]?[\d.,]+$/.test(names[0])) {
    return { ok: false, raw, reason: "otolkbar" };
  }

  return {
    ok: true,
    value: {
      articleNumber,
      name: names.length ? names[0] : null,
      quantity: quantities.length ? parseQuantity(quantities[0]) : null,
      raw,
    },
  };
}

function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  const lower = new Map(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const k of keys) {
    const v = lower.get(k);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function esc(ch: string): string {
  return ch.replace(/[\\\]^-]/g, "\\$&");
}
