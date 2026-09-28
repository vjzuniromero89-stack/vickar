import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // NEXT_PUBLIC_* is what the Vercel ↔ Supabase integration creates. Those values are public by
  // design (URL + publishable/anon key, protected by Row Level Security), so exposing them is safe.
  // Never give a secret a VITE_ or NEXT_PUBLIC_ name.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: { port: 5180 },
})
