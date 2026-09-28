import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env, optionalEnv } from "./http.js"

let client: SupabaseClient | null = null

/**
 * Server-side Supabase client with the SERVICE ROLE key — bypasses Row Level Security.
 * Only ever used inside Vercel functions; the key must never reach the browser.
 */
export function db() {
  if (!client) {
    client = createClient(env("SUPABASE_URL"), optionalEnv("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
