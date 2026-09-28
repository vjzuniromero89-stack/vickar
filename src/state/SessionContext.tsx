import type { Session, User } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { Address } from "../lib/api"
import { authRedirect, backendMode, supabase } from "../lib/supabase"

/**
 * Customer (and admin) session — one Supabase Auth session for the whole app.
 * Profile data (name, default shipping address) lives in the user's metadata.
 */

type Result = { error: string | null; needsConfirmation?: boolean }

type SessionValue = {
  enabled: boolean // false in demo mode (no Supabase)
  loading: boolean
  user: User | null
  name: string
  savedAddress: Partial<Address> | null
  /** The user arrived from a "reset password" email and must choose a new password. */
  recovering: boolean
  accessToken: () => Promise<string | null>
  signIn: (email: string, password: string) => Promise<Result>
  signUp: (name: string, email: string, password: string) => Promise<Result>
  sendReset: (email: string) => Promise<Result>
  updatePassword: (password: string) => Promise<Result>
  saveAddress: (address: Address) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/** Translate Supabase auth errors into plain, actionable messages. */
function friendly(message: string) {
  const m = message.toLowerCase()
  if (m.includes("invalid login")) return "Email or password is incorrect."
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox (and spam)."
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead."
  if (m.includes("password") && m.includes("characters")) return "Use a password with at least 8 characters."
  if (m.includes("rate limit")) return "Too many attempts. Please wait a minute and try again."
  return message
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setLoading(false)
      if (event === "PASSWORD_RECOVERY") setRecovering(true)
    })

    // Email links land on /?auth=welcome|reset — route to the account page and tidy the URL
    const params = new URLSearchParams(window.location.search)
    const intent = params.get("auth")
    if (intent) {
      if (intent === "reset") setRecovering(true)
      window.history.replaceState(null, "", `${window.location.pathname}#/account`)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    }
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<Result> => {
    if (!supabase) return { error: null }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? friendly(error.message) : null }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<Result> => {
    if (!supabase) return { error: null }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: authRedirect("welcome") },
    })
    if (error) return { error: friendly(error.message) }
    // With "Confirm email" enabled in Supabase there's no session until the link is clicked
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const sendReset = useCallback(async (email: string): Promise<Result> => {
    if (!supabase) return { error: null }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect("reset") })
    return { error: error ? friendly(error.message) : null }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<Result> => {
    if (!supabase) return { error: null }
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setRecovering(false)
    return { error: error ? friendly(error.message) : null }
  }, [])

  const saveAddress = useCallback(async (address: Address) => {
    if (!supabase) return
    const { name, phone, line1, line2, city, state, postalCode, country } = address
    await supabase.auth.updateUser({ data: { address: { name, phone, line1, line2, city, state, postalCode, country } } })
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const accessToken = useCallback(async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const value = useMemo<SessionValue>(() => {
    const user = session?.user ?? null
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; address?: Partial<Address> }
    return {
      enabled: backendMode === "supabase",
      loading,
      user,
      name: meta.full_name ?? user?.email?.split("@")[0] ?? "",
      savedAddress: meta.address ?? null,
      recovering,
      accessToken,
      signIn,
      signUp,
      sendReset,
      updatePassword,
      saveAddress,
      signOut,
    }
  }, [session, loading, recovering, accessToken, signIn, signUp, sendReset, updatePassword, saveAddress, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>")
  return ctx
}
