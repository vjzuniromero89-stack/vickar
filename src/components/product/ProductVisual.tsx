import type { Product } from "../../data/catalog"
import { ProductArt } from "./ProductArt"

type ProductVisualProps = {
  product: Product
  color: string
  /** Show the blueprint x-ray over the vector product (ignored for photography). */
  xray?: boolean
  priority?: boolean
}

/**
 * Photography when the product has an image (uploaded in the admin), vector art otherwise —
 * one component, so every surface (card, quick view, bag, product page) switches automatically.
 */
export function ProductVisual({ product, color, xray = false, priority }: ProductVisualProps) {
  if (product.image) {
    return (
      <img
        src={product.image}
        alt={product.imageAlt || product.name}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    )
  }
  const swatch = product.swatches.find((s) => s.hex === color)?.name ?? "selected colour"
  return (
    <ProductArt
      kind={product.art}
      color={color}
      materialize={1}
      blueprint="overlay"
      draw={xray}
      label={`${product.name} in ${swatch}`}
    />
  )
}
