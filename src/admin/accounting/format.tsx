import styles from "./accounting.module.css"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** $1,234.56 — negatives as −$1,234.56 (true minus sign, easier to spot than a hyphen). */
export const formatMoney = (n: number) => (n < 0 ? `−${usd.format(Math.abs(n))}` : usd.format(n))

/**
 * Money cell: tabular figures, right-aligned by the table, negatives tinted.
 * `blankZero` renders an en dash for 0 so debit/credit columns read cleanly.
 */
export function Money({ value, blankZero = false, strong = false }: { value: number; blankZero?: boolean; strong?: boolean }) {
  if (blankZero && Math.abs(value) < 0.005) return <span className={styles.zero}>–</span>
  return (
    <span className={styles.money} data-negative={value < -0.004} data-strong={strong}>
      {formatMoney(value)}
    </span>
  )
}

export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { dateStyle: "medium" })

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })

export const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })

/** Parse a user-typed amount ("1,234.5" → 1234.5). Empty → 0; invalid → NaN. */
export function parseAmount(v: string) {
  const t = v.replace(/[$,\s]/g, "")
  if (t === "") return 0
  return /^\d*\.?\d{0,2}$/.test(t) ? Number(t) : NaN
}

/** Round to cents to avoid float drift when summing. */
export const cents = (n: number) => Math.round(n * 100) / 100

/** Build and download a CSV client-side. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
