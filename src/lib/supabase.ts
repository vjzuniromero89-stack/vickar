import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase client — only created when the project's env vars are present.
 * Without them the app runs in DEMO mode (catalogue saved in this browser).
 *
 * Set in `.env.local` (local) and in Vercel → Project → Settings → Environment Variables:
 *   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (or the legacy anon key)
 * Both values are public by design; data is protected by Row Level Security (supabase/schema.sql).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export const backendMode: "supabase" | "demo" = supabase ? "supabase" : "demo"

export const IMAGE_BUCKET = "product-images"
