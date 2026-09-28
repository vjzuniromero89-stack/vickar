import { AnimatePresence, m } from "motion/react"
import { useEffect, useState, type FormEvent } from "react"
import { Logo } from "../components/brand/Logo"
import { Icon } from "../components/ui/Icon"
import { transition } from "../motion/tokens"
import { useCatalog } from "../state/CatalogContext"
import { useRouter, type AdminView } from "../state/RouterContext"
import { AuthProvider, useAuth } from "./AuthContext"
import { Categories } from "./Categories"
import { Dashboard } from "./Dashboard"
import { OrderDetail, Orders } from "./Orders"
import { ProductEditor } from "./ProductEditor"
import { ProductsList } from "./ProductsList"
import { ConfirmProvider, ToastProvider } from "./ui"
import styles from "./admin.module.css"

export function AdminApp({ view, id }: { view: AdminView; id?: string }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Gate view={view} id={id} />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  )
}

function Gate({ view, id }: { view: AdminView; id?: string }) {
  const { loading, isAdmin, email } = useAuth()
  if (loading) return <div className={styles.center}>Loading…</div>
  if (!isAdmin) return email ? <NotAdmin /> : <Login />
  return <Layout view={view} id={id} />
}

const nav: { view: AdminView; label: string; icon: Parameters<typeof Icon>[0]["name"]; hash: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: "grid", hash: "#/admin" },
  { view: "orders", label: "Orders", icon: "receipt", hash: "#/admin/orders" },
  { view: "products", label: "Products", icon: "box", hash: "#/admin/products" },
  { view: "categories", label: "Categories", icon: "tag", hash: "#/admin/categories" },
]

function Layout({ view, id }: { view: AdminView; id?: string }) {
  const { mode, email, signOut } = useAuth()
  const { reload, error, clearError } = useCatalog()
  const section = view === "product" ? "products" : view === "order" ? "orders" : view

  // Admins can see drafts (RLS) — refetch once signed in so unpublished products appear
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    document.title = "VICKAR Admin"
    return () => {
      document.title = "VICKAR — Everything, One Store"
    }
  }, [])

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <a href="#/admin" className={styles.brand} aria-label="VICKAR admin home">
          <Logo size={20} />
          <span className={`t-label ${styles.brandTag}`}>Admin</span>
        </a>
        <nav aria-label="Admin">
          <ul className={styles.nav}>
            {nav.map((n) => (
              <li key={n.view}>
                <a href={n.hash} className={styles.navItem} aria-current={section === n.view ? "page" : undefined}>
                  {section === n.view && <m.span layoutId="admin-nav" className={styles.navPill} />}
                  <Icon name={n.icon} size={18} />
                  <span>{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.sideFoot}>
          <a href="#/" className={styles.navItem}>
            <Icon name="external" size={18} />
            <span>View store</span>
          </a>
          {mode === "supabase" && (
            <button type="button" className={styles.navItem} onClick={signOut}>
              <Icon name="logout" size={18} />
              <span>Sign out</span>
            </button>
          )}
          <p className={`t-small t-soft ${styles.who}`}>{email}</p>
        </div>
      </aside>

      <main id="admin-main" className={styles.main}>
        {mode === "demo" && (
          <p className={styles.demoBanner} role="note">
            <strong>Demo mode.</strong> Changes are saved in this browser only and anyone can open this page. Connect Supabase
            (see SETUP.md) for real accounts, shared data and orders.
          </p>
        )}
        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}{" "}
            <button type="button" onClick={clearError}>
              Dismiss
            </button>
          </p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`${view}-${id ?? ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: transition.exit }}
            transition={{ duration: 0.25 }}
          >
            {view === "dashboard" && <Dashboard />}
            {view === "products" && <ProductsList />}
            {view === "product" && <ProductEditor id={id!} />}
            {view === "categories" && <Categories />}
            {view === "orders" && <Orders />}
            {view === "order" && <OrderDetail id={id!} />}
          </m.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function Login() {
  const { signIn, sendReset } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setError(await signIn(email.trim(), password))
    setBusy(false)
  }

  const onReset = async () => {
    if (!email.trim()) {
      setError("Enter your email first, then choose “Forgot password”.")
      return
    }
    const err = await sendReset(email.trim())
    setError(err)
    setInfo(err ? null : "Check your inbox for a password reset link.")
  }

  return (
    <div className={styles.center}>
      <m.form
        className={styles.login}
        onSubmit={onSubmit}
        initial={{ opacity: 0, transform: "translateY(12px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={transition.reveal}
        noValidate
      >
        <Logo size={26} />
        <h1 className="t-h2">Admin sign in</h1>
        <div className={styles.field}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="t-small" role="status">
            {info}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" className={styles.textButton} onClick={onReset}>
          Forgot password
        </button>
        <a href="#/" className={styles.textButton}>
          ← Back to store
        </a>
      </m.form>
    </div>
  )
}

function NotAdmin() {
  const { email, signOut } = useAuth()
  const { go } = useRouter()
  return (
    <div className={styles.center}>
      <div className={styles.login}>
        <h1 className="t-h2">No admin access</h1>
        <p className="t-soft">
          {email} is signed in but isn't an admin. Add this user to the <code>admins</code> table in Supabase (see SETUP.md), then sign in
          again.
        </p>
        <button type="button" className="btn btn--primary" onClick={signOut}>
          Sign out
        </button>
        <button type="button" className={styles.textButton} onClick={() => go("#/")}>
          ← Back to store
        </button>
      </div>
    </div>
  )
}
