// Tolkar QR-koden på kundens hyllkant.
//
// Koden innehåller ett artikelnummer, och ibland dessutom ett förregistrerat
// antal av just den artikeln.
//
// SKILJETECKNET är valt mot verkligheten, inte gissat. Alla 82 492
// artikelnummer i registret granskades: de består av siffror och bokstäver, och
// de enda skiljetecken som förekommer är bindestreck (74 artiklar, t.ex.
// "-6667"), snedstreck och plus (en artikel: "NK26/16+IR22"). Alltså:
//
//   säkra separatorer   *  ;  |  blanksteg  tabb   – finns i inget artikelnr
//   FÅR INTE användas   -  /  +                    – finns i artikelnummer
//
// Kommatecken är medvetet INTE separator, fast det heller inte förekommer i
// något artikelnummer: på svenska etiketter är komma decimaltecken ("2,5 m").
// Vore det separator gick "7900696*2,5" sönder i tre delar och avslogs. Ett
// format som "artikel,antal" förlorar vi, men det är just därför osannolikt.
//
// Hittar vi inget vi känner igen gissar vi INTE. Då avslås koden och råkoden
// visas för kunden. En feltolkad siffra är en felaktig order, och en order är
// pengar.

/** Separatorer som aldrig förekommer inuti ett artikelnummer. */
const SEPARATORS = ["*", ";", "|", "\t", " "];

/**
 * Tecken ett artikelnummer får bestå av.
 *
 * Hela registret granskades: siffror, bokstäver, och därtill bindestreck (74
 * artiklar), snedstreck, plus och Ä (en artikel vardera). Kontrollen finns för
 * att kunden förr eller senare skannar fel dekal — en URL, en följesedel, en
 * transportetikett. Utan den skulle sådant passera som "artikelnummer" och
 * misslyckas först vid uppslaget, med en rad i ordern på vägen.
 */
const ARTICLE_CHARS = /^[0-9A-Za-zÅÄÖåäö\-/+]+$/;

export interface ScanResult {
  /** Artikelnummer precis som det stod i koden (ledande nollor bevarade). */
  articleNumber: string;
  /** Förregistrerat antal, eller null när koden bara bar artikelnummer. */
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
 * uppslag – ordern bär alltid registrets egen skrivning.
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
        return {
          ok: true,
          value: {
            articleNumber: art,
            quantity: qtyRaw ? parseQuantity(qtyRaw) : null,
            raw,
          },
        };
      }
    } catch {
      // Ogiltig JSON – behandla som vanlig text.
    }
  }

  const sep = SEPARATORS.find((c) => text.includes(c));
  if (!sep) {
    return ARTICLE_CHARS.test(text)
      ? { ok: true, value: { articleNumber: text, quantity: null, raw } }
      : { ok: false, raw, reason: "otolkbar" };
  }

  // Tomma fält faller bort, så "1234 ; 5" och "1234;5" tolkas lika.
  const parts = text
    .split(new RegExp(`[${SEPARATORS.map(esc).join("")}]`))
    .map((p) => p.trim())
    .filter((p) => p !== "");

  if (parts.length > 2 || !ARTICLE_CHARS.test(parts[0])) {
    return { ok: false, raw, reason: "otolkbar" };
  }
  if (parts.length === 1) {
    return { ok: true, value: { articleNumber: parts[0], quantity: null, raw } };
  }
  const qty = parseQuantity(parts[1]);
  // Andra delen ska vara ett antal. Är den något annat vet vi inte vad koden
  // betyder, och då är det fel att låta första delen passera som artikelnummer.
  if (qty === null) return { ok: false, raw, reason: "otolkbar" };
  return { ok: true, value: { articleNumber: parts[0], quantity: qty, raw } };
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
