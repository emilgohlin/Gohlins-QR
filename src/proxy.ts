// Vakten framför de inloggade sidorna.
//
// Proxyn gör en OPTIMISTISK kontroll: finns ingen kaka alls skickas besökaren
// till inloggningen direkt, utan att sidan renderas. Den verifierar däremot
// INTE signaturen — det kräver hemligheten och görs i stället på serversidan i
// respektive page.tsx, som är den kontroll som gäller.
//
// Skälet till uppdelningen: proxyn körs på varje request och ska vara billig,
// och en kaka man själv skrivit ihop kommer ändå inte längre än till sidan där
// den avslöjas.
//
// Kundsidan och adminsidan tittar efter VAR SIN kaka. En kund som är inloggad
// som kund har ingen adminkaka och kommer inte förbi den här raden.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, ADMIN_COOKIE } from "@/lib/sessionCookie";

export function proxy(request: NextRequest) {
  const admin = request.nextUrl.pathname.startsWith("/admin");
  const kaka = admin ? ADMIN_COOKIE : SESSION_COOKIE;
  if (!request.cookies.has(kaka)) {
    return NextResponse.redirect(new URL(admin ? "/admin" : "/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // /admin självt är inloggningssidan och ska vara öppen – bara sidorna
  // innanför vaktas.
  matcher: ["/bestall/:path*", "/admin/ordrar/:path*"],
};
