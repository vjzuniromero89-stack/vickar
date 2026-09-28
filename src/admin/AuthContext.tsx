import type { Session } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { backendMode, supabase } from "../lib/supabase"

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
 * Admin authentication.
 * - Supabase mode: email + password via Supabase Auth; admin rights come from the `admins` table,
 *   and every write is re-checked by Row Level Security on the server.
 * - Demo mode (no Supabase env vars): open access with a warning banner — for local design work only.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(backendMode === "demo")
  const [loading, setLoading] = useState(backendMode === "supabase")

  useEffect(() => {
    if (!supabase) return
    const check = async (s: Session | null) => {
      setSession(s)
      if (!s) {
        setIsAdmin(false)
        setLoading(false)
        return
      }
      const { data } = await supabase!.from("admins").select("user_id").eq("user_id", s.user.id).maybeSingle()
      setIsAdmin(Boolean(data))
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => check(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void check(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return null
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? "Email or password is incorrect." : null
  }, [])

  const sendReset = useCallback(async (email: string) => {
    if (!supabase) return null
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/admin`,
    })
    return error ? error.message : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      mode: backendMode,
      loading,
      email: backendMode === "demo" ? "demo@vickar.local" : (session?.user.email ?? null),
      isAdmin,
      signIn,
      sendReset,
      signOut,
    }),
    [loading, session, isAdmin, signIn, sendReset, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
