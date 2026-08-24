import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Göhlins Kundorder",
  description: "Skanna hyllkanten och beställ.",
};

export const viewport: Viewport = {
  // Appen körs i handen, inte på en skärm. Zoomen låses inte – den som behöver
  // förstora ska få göra det – men sidan ska börja i telefonens bredd.
  width: "device-width",
  initialScale: 1,
  themeColor: "#ca3c35",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="min-h-dvh bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
