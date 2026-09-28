import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { backendMode, supabase } from "../lib/supabase"
import { useSession } from "../state/SessionContext"

type AuthValue = {
  mode: "demo" | "supabase"
  loading: boolean
  email: string | null
  /** Signed in AND listed in public.admins (checked by the database, not the browser). */
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  sendReset: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Admin access on top of the app-wide session.
 * - Supabase mode: admin rights come from the `admins` table, and every write is re-checked
 *   by Row Level Security on the server.
 * - Demo mode (no Supabase env vars): open access with a warning banner — local design work only.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const userId = session.user?.id
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAdminCheck({ userId, isAdmin: Boolean(data) })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const value = useMemo<AuthValue>(() => {
    if (backendMode === "demo") {
      return {
        mode: "demo",
        loading: false,
        email: "demo@vickar.local",
        isAdmin: true,
        signIn: async () => null,
        sendReset: async () => null,
        signOut: async () => {},
      }
    }
    const checked = adminCheck?.userId === userId
    return {
      mode: "supabase",
      loading: session.loading || (Boolean(userId) && !checked),
      email: session.user?.email ?? null,
      isAdmin: Boolean(userId) && checked && adminCheck!.isAdmin,
      signIn: async (email, password) => (await session.signIn(email, password)).error,
      sendReset: async (email) => (await session.sendReset(email)).error,
      signOut: session.signOut,
    }
  }, [session, userId, adminCheck])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
