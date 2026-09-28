import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase client — only created when the project's env vars are present.
 * Without them the app runs in DEMO mode (catalogue saved in this browser).
 *
 * Set in `.env.local` (local) and in Vercel → Project → Settings → Environment Variables
 * (the Vercel Supabase integration's NEXT_PUBLIC_SUPABASE_* names are accepted too):
 *   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (or the legacy anon key)
 * Both values are public by design; data is protected by Row Level Security (supabase/schema.sql).
 */
const env = import.meta.env
const url = (env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

/**
 * PKCE flow: email links (confirm account, reset password) come back as `?code=…` in the query
 * string, which doesn't collide with the app's `#/…` hash routes. supabase-js exchanges the code
 * for a session automatically on load.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } }) : null

export const backendMode: "supabase" | "demo" = supabase ? "supabase" : "demo"

export const IMAGE_BUCKET = "product-images"

/** Where email links land. Query (not hash) so the auth code survives; the app routes from there. */
export const authRedirect = (intent: "welcome" | "reset") => `${window.location.origin}/?auth=${intent}`
