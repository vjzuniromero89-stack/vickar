import { Catalog } from "../sections/Catalog"
import { Newsletter } from "../sections/Newsletter"
import { Perks } from "../sections/Perks"
import { Showroom } from "../sections/showroom/Showroom"

/** One page, the whole store: 3D glass boutique → trust strip → full catalogue → drops. */
export function Home() {
  return (
    <>
      <Showroom />
      <Perks />
      <Catalog />
      <Newsletter />
    </>
  )
}
