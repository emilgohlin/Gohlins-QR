// Supabase-klienten. Servern, och bara servern.
//
// Nyckeln är service-nyckeln, som går förbi RLS. Tabellerna har RLS på UTAN
// policyer (se supabase/migrations/0001_init.sql), så det här är den enda vägen
// in i datat — och därför får modulen aldrig nå webbläsaren. "server-only"
// gör ett sådant misstag till ett byggfel i stället för en läcka.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  // Klienten skapas en gång och återanvänds; varje ny instans är en ny
  // uppkopplingspool.
  if (!client) {
    client = createClient<Database>(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
