import { Catalog } from "../sections/Catalog"
import { Hero } from "../sections/Hero"
import { Newsletter } from "../sections/Newsletter"
import { Perks } from "../sections/Perks"

/** One page, the whole store: overview hero → trust strip → full catalogue → drops. */
export function Home() {
  return (
    <>
      <Hero />
      <Perks />
      <Catalog />
      <Newsletter />
    </>
  )
}
