// Gör appen installerbar på hemskärmen.
//
// SKÄLET ÄR KAMERAN, inte ikonen. Safari på iOS frågar om kameratillstånd en
// gång per SIDLADDNING så länge appen körs i webbläsaren — det går inte att
// programmera bort, det är webbläsarens policy. Installerad på hemskärmen
// behandlas den däremot som en app: tillståndet ges en gång och ligger kvar.
//
// För en kund som står i en lagergång och skannar tjugo artiklar är det
// skillnaden mellan ett verktyg och en dialogruta.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Göhlins Kundorder",
    short_name: "Göhlins",
    description: "Skanna hyllkanten och beställ.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#ca3c35",
    lang: "sv",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
