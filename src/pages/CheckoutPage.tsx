import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { AuthPanel } from "../components/account/AuthPanel"
import { ProductVisual } from "../components/product/ProductVisual"
import { Icon } from "../components/ui/Icon"
import { countries, needsState } from "../data/countries"
import { formatPrice } from "../data/catalog"
import { api, ApiError, type Address, type ShippingRate } from "../lib/api"
import { stagger, transition } from "../motion/tokens"
import { useBag } from "../state/BagContext"
import { useSession } from "../state/SessionContext"
import { useShop } from "../state/ShopContext"
import styles from "./CheckoutPage.module.css"

const ADDRESS_KEY = "vickar.address.v1"
const emptyAddress: Address = { name: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "US" }

const loadAddress = (): Address => {
  try {
    return { ...emptyAddress, ...JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? "{}") }
  } catch {
    return emptyAddress
  }
}

type Errors = Partial<Record<keyof Address, string>>

function validate(a: Address): Errors {
  const e: Errors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) e.email = "Enter a valid email, like name@example.com."
  if (!a.name.trim()) e.name = "Enter the recipient's full name."
  if (!a.line1.trim()) e.line1 = "Enter a street address."
  if (!a.city.trim()) e.city = "Enter a city."
  if (!a.postalCode.trim()) e.postalCode = "Enter a postal code."
  if (needsState.has(a.country) && !a.state?.trim()) e.state = "Enter a state / province."
  return e
}

/**
 * Checkout — two steps on one page:
 *  1. Contact + shipping address  →  live rates from the server (Easyship or flat)
 *  2. Choose shipping  →  server re-prices everything, then hands off to Stripe Checkout
 */
export function CheckoutPage() {
  const { lines, subtotal } = useBag()
  const { shop } = useShop()
  const session = useSession()
  const reduced = useReducedMotion()
  const [address, setAddress] = useState<Address>(loadAddress)
  const [errors, setErrors] = useState<Errors>({})
  const [step, setStep] = useState<1 | 2>(1)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [rateId, setRateId] = useState("")
  const [busy, setBusy] = useState<"rates" | "pay" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const items = useMemo(() => lines.map((l) => ({ productId: l.productId, color: l.color, qty: l.qty })), [lines])
  const needsAccount = session.enabled && !session.user
  const rate = rates.find((r) => r.id === rateId)
  const total = subtotal + (rate?.amount ?? 0)

  // Signed in: the account email is the order email; prefill name + saved address
  const userEmail = session.user?.email ?? ""
  useEffect(() => {
    if (!userEmail) return
    setAddress((a) => ({
      ...a,
      ...(a.line1 ? {} : session.savedAddress),
      name: a.name || session.savedAddress?.name || session.name,
      email: userEmail,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail])

  // Any cart change invalidates quoted rates
  useEffect(() => {
    setStep(1)
    setRates([])
    setRateId("")
  }, [items])

  const set = (k: keyof Address) => (e: { target: { value: string } }) => {
    setAddress((a) => ({ ...a, [k]: e.target.value }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }

  const onContinue = async (e: FormEvent) => {
    e.preventDefault()
    const found = validate(address)
    setErrors(found)
    if (Object.keys(found).length) {
      document.getElementById(`co-${Object.keys(found)[0]}`)?.focus()
      return
    }
    setBusy("rates")
    setError(null)
    try {
      try {
        localStorage.setItem(ADDRESS_KEY, JSON.stringify(address))
      } catch {
        /* optional convenience */
      }
      const res = await api.shippingRates(items, address)
      void session.saveAddress(address) // remembered for next time (account metadata)
      setRates(res.rates)
      setRateId(res.rates[0]?.id ?? "")
      setStep(2)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get shipping options.")
    } finally {
      setBusy(null)
    }
  }

  const onPay = async () => {
    if (!rateId) return
    setBusy("pay")
    setError(null)
    try {
      const { url } = await api.checkout(items, address, rateId, await session.accessToken())
      window.location.assign(url) // Stripe-hosted payment page
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the payment.")
      setBusy(null)
    }
  }

  if (lines.length === 0) {
    return (
      <section className={`container ${styles.empty}`}>
        <p className="t-label t-accent">Checkout</p>
        <h1 className="t-h1">Your bag is empty.</h1>
        <button type="button" className="btn btn--primary" onClick={() => shop("all")}>
          Browse products
        </button>
      </section>
    )
  }

  const field = (k: keyof Address, label: string, props: Record<string, unknown> = {}) => (
    <div className={styles.field} data-invalid={Boolean(errors[k])}>
      <label htmlFor={`co-${k}`}>{label}</label>
      <input
        id={`co-${k}`}
        value={address[k] ?? ""}
        onChange={set(k)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `co-${k}-err` : undefined}
        disabled={step === 2}
        {...props}
      />
      {errors[k] && (
        <p id={`co-${k}-err`} className={styles.error}>
          {errors[k]}
        </p>
      )}
    </div>
  )

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <p className="t-label t-accent">Secure checkout</p>
        <h1 className="t-h1">Checkout</h1>
        <ol className={styles.steps} aria-label="Checkout steps">
          <li data-active={step === 1} aria-current={step === 1 ? "step" : undefined}>1 · Address</li>
          <li data-active={step === 2} aria-current={step === 2 ? "step" : undefined}>2 · Shipping</li>
          <li>3 · Payment</li>
        </ol>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          {needsAccount ? (
            <AuthPanel
              title="Sign in to check out"
              subtitle="Your bag is saved. With an account you can track this order and see every purchase in one place."
              initialMode="signup"
            />
          ) : (
          <>
          <form className={styles.card} onSubmit={onContinue} noValidate>
            <div className={styles.cardHead}>
              <h2 className="t-h3">Contact & shipping address</h2>
              {step === 2 && (
                <button type="button" className={styles.link} onClick={() => setStep(1)}>
                  Edit
                </button>
              )}
            </div>
            <div className={styles.grid}>
              {field("email", session.user ? "Email (your account)" : "Email", {
                type: "email",
                autoComplete: "email",
                inputMode: "email",
                className: styles.full,
                readOnly: Boolean(session.user),
              })}
              {field("name", "Full name", { autoComplete: "name" })}
              {field("phone", "Phone (optional, for the courier)", { type: "tel", autoComplete: "tel" })}
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="co-country">Country</label>
                <select id="co-country" value={address.country} onChange={set("country")} disabled={step === 2} autoComplete="country">
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {field("line1", "Street address", { autoComplete: "address-line1", className: styles.full })}
              {field("line2", "Apartment, suite, etc. (optional)", { autoComplete: "address-line2", className: styles.full })}
              {field("city", "City", { autoComplete: "address-level2" })}
              {field("state", needsState.has(address.country) ? "State / province" : "State / region (optional)", { autoComplete: "address-level1" })}
              {field("postalCode", "Postal code", { autoComplete: "postal-code" })}
            </div>
            {step === 1 && (
              <button type="submit" className={`btn btn--primary ${styles.submit}`} disabled={busy === "rates"}>
                {busy === "rates" ? <Spinner label="Getting shipping options" /> : "Continue to shipping"}
              </button>
            )}
          </form>

          <AnimatePresence initial={false}>
            {step === 2 && (
              <m.section
                className={styles.card}
                aria-labelledby="co-ship-title"
                initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(16px)" }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transition: transition.exit }}
                transition={transition.reveal}
              >
                <h2 id="co-ship-title" className="t-h3">
                  Shipping method
                </h2>
                <m.div
                  role="radiogroup"
                  aria-labelledby="co-ship-title"
                  className={styles.rates}
                  initial="hidden"
                  animate="shown"
                  transition={{ staggerChildren: stagger.items }}
                >
                  {rates.map((r) => (
                    <m.label
                      key={r.id}
                      className={styles.rate}
                      data-selected={r.id === rateId}
                      variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
                    >
                      <input type="radio" name="rate" value={r.id} checked={r.id === rateId} onChange={() => setRateId(r.id)} />
                      <span className={styles.rateName}>
                        {r.name}
                        {r.minDays != null && r.maxDays != null && (
                          <span className="t-small t-soft">
                            {r.minDays === r.maxDays ? `${r.minDays}` : `${r.minDays}–${r.maxDays}`} business days
                          </span>
                        )}
                      </span>
                      <span className={styles.ratePrice}>{r.amount === 0 ? "Free" : formatPrice(r.amount)}</span>
                    </m.label>
                  ))}
                </m.div>
                <button type="button" className={`btn btn--primary ${styles.submit}`} onClick={onPay} disabled={!rateId || busy === "pay"}>
                  {busy === "pay" ? <Spinner label="Opening secure payment" /> : <>Pay {formatPrice(total)} securely</>}
                </button>
                <p className="t-small t-soft">
                  You'll complete payment on Stripe. We never see or store your card details.
                </p>
              </m.section>
            )}
          </AnimatePresence>

          </>
          )}

          <AnimatePresence>
            {error && (
              <m.p
                className={styles.alert}
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        <aside className={styles.summary} aria-labelledby="co-summary">
          <h2 id="co-summary" className="t-h3">
            Order summary
          </h2>
          <ul className={styles.items}>
            {lines.map((l) => (
              <li key={l.key}>
                <span className={styles.thumb} data-photo={Boolean(l.product.image)}>
                  <ProductVisual product={l.product} color={l.color} />
                  <span className={styles.qtyBadge}>{l.qty}</span>
                </span>
                <span className={styles.itemName}>
                  {l.product.name}
                  <span className="t-small t-soft">{l.colorName}</span>
                </span>
                <span>{formatPrice(l.product.price * l.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{rate ? (rate.amount === 0 ? "Free" : formatPrice(rate.amount)) : "Next step"}</dd>
            </div>
            <div className={styles.total}>
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          <p className={`t-small t-soft ${styles.secure}`}>
            <Icon name="lock" size={14} /> Secure payment by Stripe · 30-day returns
          </p>
        </aside>
      </div>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <span className={styles.spinnerWrap}>
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}…</span>
    </span>
  )
}
