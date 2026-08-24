// Kakornas namn, i en egen fil.
//
// proxy.ts behöver namnen men får INTE dra in session.ts: den importerar
// node:crypto och next/headers, och proxyn kan köras i en runtime där de inte
// finns. Konstanter i en egen modul kostar ingenting och gör beroendet omöjligt
// att råka återinföra.

export const SESSION_COOKIE = "gohlins_session";

/**
 * Personalens kaka är en EGEN kaka, inte ett fält i kundens.
 *
 * Skulle rollen ligga inne i samma kaka räcker det att någon kodar om ett fält
 * fel — eller att en kontroll glöms på ett ställe — för att en kund ska bli
 * admin. Två kakor kan inte förväxlas: kundsidan läser bara den ena och
 * adminsidan bara den andra.
 */
export const ADMIN_COOKIE = "gohlins_admin";
