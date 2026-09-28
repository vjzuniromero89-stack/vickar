/** Five-star rating: the numeric value is the accessible text; stars are decorative. */
export function Rating({ value, reviews, className }: { value: number; reviews: number; className?: string }) {
  // No reviews yet: say so plainly instead of showing five empty stars
  if (reviews === 0) return <p className={className}>New · no reviews yet</p>
  const pct = (value / 5) * 100
  return (
    <p className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          display: "inline-block",
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          lineHeight: 1,
          color: "rgb(128 128 128 / 0.45)",
        }}
      >
        ★★★★★
        <span style={{ position: "absolute", inset: 0, width: `${pct}%`, overflow: "hidden", color: "var(--c-accent)" }}>
          ★★★★★
        </span>
      </span>
      <span className="t-small">
        {value.toFixed(1)}
        <span className="sr-only"> out of 5 stars,</span> <span style={{ opacity: 0.6 }}>({reviews.toLocaleString("en-US")})</span>
      </span>
    </p>
  )
}
