/**
 * VICKAR catalogue — types and seed data.
 * PLACEHOLDER DATA: names, prices, ratings and specs are stand-ins.
 * The live catalogue is managed from the admin (#/admin) via src/state/CatalogContext.tsx;
 * these seeds are only used the first time (or after "Reset demo data").
 */

/** Built-in vector illustrations. "box" is the generic fallback for new kinds of product. */
export type ArtKind = "bottle" | "sport" | "sunglasses" | "watch" | "box"

export const artKinds: { id: ArtKind; label: string }[] = [
  { id: "bottle", label: "Steel bottle" },
  { id: "sport", label: "Sport bottle" },
  { id: "sunglasses", label: "Sunglasses" },
  { id: "watch", label: "Watch" },
  { id: "box", label: "Generic (box)" },
]

export type CategoryId = string

export type Category = {
  id: CategoryId
  label: string
  /** Hero chapter copy */
  headline: [string, string]
  pitch: string
  art: ArtKind
  spec: string
}

export type Swatch = { name: string; hex: string }

export type Product = {
  id: string
  name: string
  category: CategoryId
  price: number
  compareAt?: number
  rating: number
  reviews: number
  badge?: "New" | "Bestseller" | "Limited"
  blurb: string
  specs: string[]
  swatches: Swatch[]
  art: ArtKind
  /** Product photo (URL or uploaded data URL). Falls back to the vector art when absent. */
  image?: string
  imageAlt?: string
  /** Hidden from the storefront when false. */
  published: boolean
  /** Units available; undefined/null = unlimited. */
  stock?: number | null
  /** Shipping: packed weight (kg), box (cm) and customs HS code — used for carrier rates. */
  weightKg?: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  hsCode?: string
}

export const badges = ["New", "Bestseller", "Limited"] as const

export const seedCategories: Category[] = [
  {
    id: "bottles",
    label: "Steel bottles",
    headline: ["Cold for 24 hours.", "Hot for 12."],
    pitch: "Double-wall stainless steel, vacuum sealed, built to outlast every single-use bottle you'll never buy.",
    art: "bottle",
    spec: "750 ML · 18/8 STEEL",
  },
  {
    id: "sport",
    label: "Sport bottles",
    headline: ["Built for", "the long run."],
    pitch: "One-hand squeeze, lock-flow nozzle, and a grip shaped to stay in your hand at kilometre thirty.",
    art: "sport",
    spec: "650 ML · BPA FREE",
  },
  {
    id: "sunglasses",
    label: "Sunglasses",
    headline: ["Light,", "filtered."],
    pitch: "Polarised lenses with full UV400 protection in frames light enough to forget you're wearing them.",
    art: "sunglasses",
    spec: "UV400 · POLARISED",
  },
  {
    id: "watches",
    label: "Watches",
    headline: ["Time,", "well kept."],
    pitch: "Sapphire crystal, 100 m water resistance and movements you can hear if you listen closely.",
    art: "watch",
    spec: "Ø 40 MM · 10 ATM",
  },
]

export const seedProducts: Product[] = [
  {
    id: "arc-750",
    name: "Arc Steel Bottle 750",
    category: "bottles",
    price: 39,
    rating: 4.8,
    reviews: 1284,
    badge: "Bestseller",
    blurb: "Our everyday insulated bottle. Keeps drinks cold 24 h and hot 12 h, fits most cup holders.",
    specs: ["750 ml", "18/8 stainless steel", "Leak-proof loop cap", "Dishwasher-safe lid"],
    swatches: [
      { name: "Graphite", hex: "#3b4047" },
      { name: "Ember", hex: "#ff7a45" },
      { name: "Glacier", hex: "#b9d6e6" },
    ],
    art: "bottle",
    published: true,
  },
  {
    id: "arc-500",
    name: "Arc Mini 500",
    category: "bottles",
    price: 32,
    rating: 4.7,
    reviews: 612,
    badge: "New",
    blurb: "The same insulation in a bag-friendly size.",
    specs: ["500 ml", "18/8 stainless steel", "Powder-coat grip"],
    swatches: [
      { name: "Sage", hex: "#8fa38a" },
      { name: "Bone", hex: "#e6e0d4" },
      { name: "Graphite", hex: "#3b4047" },
    ],
    art: "bottle",
    published: true,
  },
  {
    id: "stride-650",
    name: "Stride Squeeze 650",
    category: "sport",
    price: 24,
    rating: 4.6,
    reviews: 903,
    blurb: "Soft-squeeze bottle with a lock-flow nozzle. Rinse-and-go wide mouth.",
    specs: ["650 ml", "BPA-free", "Lock-flow nozzle", "Grip waist"],
    swatches: [
      { name: "Volt", hex: "#c6f432" },
      { name: "Cobalt", hex: "#2f5bff" },
      { name: "Carbon", hex: "#25282c" },
    ],
    art: "sport",
    published: true,
  },
  {
    id: "stride-pro",
    stock: 12,
    name: "Stride Pro Insulated",
    category: "sport",
    price: 34,
    compareAt: 42,
    rating: 4.8,
    reviews: 377,
    badge: "Limited",
    blurb: "Double-wall squeeze bottle that keeps water cool for a full training session.",
    specs: ["600 ml", "Insulated double wall", "Self-sealing valve"],
    swatches: [
      { name: "Ember", hex: "#ff7a45" },
      { name: "Ice", hex: "#cfe8f3" },
    ],
    art: "sport",
    published: true,
  },
  {
    id: "solace",
    name: "Solace Round",
    category: "sunglasses",
    price: 89,
    rating: 4.7,
    reviews: 541,
    badge: "New",
    blurb: "A soft round frame with polarised lenses for bright, everyday light.",
    specs: ["Polarised", "UV400", "Acetate frame", "Spring hinges"],
    swatches: [
      { name: "Tortoise", hex: "#7a4a26" },
      { name: "Onyx", hex: "#1c1d20" },
      { name: "Amber", hex: "#c9853a" },
    ],
    art: "sunglasses",
    published: true,
  },
  {
    id: "vector",
    name: "Vector Sport",
    category: "sunglasses",
    price: 119,
    rating: 4.9,
    reviews: 288,
    blurb: "Wraparound performance frame, 24 g, with grippy nose pads for running and cycling.",
    specs: ["Polarised", "UV400", "24 g TR90 frame", "Hydrophobic coating"],
    swatches: [
      { name: "Ice blue", hex: "#6fb6e8" },
      { name: "Onyx", hex: "#1c1d20" },
    ],
    art: "sunglasses",
    published: true,
  },
  {
    id: "meridian",
    name: "Meridian Automatic",
    category: "watches",
    price: 249,
    rating: 4.9,
    reviews: 196,
    badge: "Bestseller",
    blurb: "An automatic 40 mm field watch with a sapphire crystal and 42-hour power reserve.",
    specs: ["Ø 40 mm", "Automatic movement", "Sapphire crystal", "100 m water resistant"],
    swatches: [
      { name: "Steel", hex: "#aeb4bb" },
      { name: "Ember dial", hex: "#ff7a45" },
      { name: "Black", hex: "#1c1d20" },
    ],
    art: "watch",
    published: true,
  },
  {
    id: "pulse",
    name: "Pulse Field",
    category: "watches",
    price: 179,
    compareAt: 199,
    rating: 4.6,
    reviews: 142,
    blurb: "Quartz field watch with lume hands and a quick-release strap.",
    specs: ["Ø 38 mm", "Quartz", "Mineral crystal", "Quick-release strap"],
    swatches: [
      { name: "Olive", hex: "#6b7250" },
      { name: "Sand", hex: "#cbb89a" },
    ],
    art: "watch",
    published: true,
  },
]


export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
