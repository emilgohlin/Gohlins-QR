// Bygger appens ikoner ur logotypfilen.
//
// Ett skript och inte handklippta filer, så att ikonerna går att göra om när
// logotypen byts – och så att den som undrar var de kommer ifrån får svar.
//
// MOTIVET: G:et ur ordmärket, vitt på Göhlins röda, med QR-kodens sökrutor i
// två hörn. Sökrutorna är det man känner igen en QR-kod på och de läses vid
// 16 px; ordet "QR-kod" gör det inte, sex bokstäver på 16 px är en grå fläck.
//
// Vitt på rött, inte rött på vitt: en ljus ikon försvinner i en ljus flikrad.
//
// Körs med: npm run bygg-ikoner   (kräver python3 med Pillow)

import { execFileSync } from "node:child_process";

const SKRIPT = `
from PIL import Image, ImageDraw

RÖD = (202, 60, 53); VIT = (255, 255, 255)

källa = Image.open("public/gohlins-logotyp.png").convert("RGB")
# G:ets ruta är uppmätt ur filen, inte gissad: allt som inte är nästan vitt,
# fram till första lodräta luckan i ordmärket.
g = källa.crop((21, 730, 413, 1089))
glyf = g.point(lambda v: 255 if v < 240 else 0).convert("L")

def ikon(s, rundad):
    duk = Image.new("RGBA", (s, s), (*RÖD, 255))
    ri = ImageDraw.Draw(duk)
    r, m = int(s * 0.15), int(s * 0.075)
    t = max(2, int(s * 0.03))
    for (x, y) in [(s - m - r, m), (m, s - m - r)]:
        ri.rectangle((x, y, x + r, y + r), outline=VIT, width=t)
        ri.rectangle((x + t * 2, y + t * 2, x + r - t * 2, y + r - t * 2), fill=VIT)
    mål = int(s * 0.46)
    sk = min(mål / g.width, mål / g.height)
    b, h = int(g.width * sk), int(g.height * sk)
    duk.paste(Image.new("RGBA", (b, h), (*VIT, 255)),
              ((s - b) // 2, (s - h) // 2), glyf.resize((b, h), Image.LANCZOS))
    if rundad:
        hörn = Image.new("L", (s, s), 0)
        ImageDraw.Draw(hörn).rounded_rectangle((0, 0, s - 1, s - 1),
                                               radius=int(s * 0.22), fill=255)
        duk.putalpha(hörn)
    return duk

ikon(512, True).save("src/app/icon.png")
# iOS lägger på sin egen mask, så hemskärmsikonen ska vara ORUNDAD och utan
# genomskinlighet – annars får den dubbla hörn.
ikon(180, False).convert("RGB").save("src/app/apple-icon.png")
print("icon.png och apple-icon.png skrivna")
`;

console.log(execFileSync("python3", ["-c", SKRIPT], { encoding: "utf8" }).trim());
