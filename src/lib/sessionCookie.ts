// Bara kakans namn, i en egen fil.
//
// proxy.ts behöver namnet men får INTE dra in session.ts: den importerar
// node:crypto och next/headers, och proxyn kan köras i en runtime där de inte
// finns. En konstant i en egen modul kostar ingenting och gör beroendet omöjligt
// att råka återinföra.

export const SESSION_COOKIE = "gohlins_session";
