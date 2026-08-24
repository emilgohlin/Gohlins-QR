// Vakten framför beställningssidan.
//
// Proxyn gör en OPTIMISTISK kontroll: finns ingen sessionskaka alls skickas
// besökaren till inloggningen direkt, utan att sidan renderas. Den verifierar
// däremot INTE signaturen — det kräver hemligheten och görs i stället på
// serversidan i src/app/bestall/page.tsx, som är den kontroll som gäller.
//
// Skälet till uppdelningen: proxyn körs på varje request och ska vara billig,
// och en kaka man själv skrivit ihop kommer ändå inte längre än till sidan där
// den avslöjas.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/sessionCookie";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/bestall/:path*",
};
