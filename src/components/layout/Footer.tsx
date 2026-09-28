import { useShop } from "../../state/ShopContext"
import { useCatalog } from "../../state/CatalogContext"
import { LogoMark } from "../brand/Logo"
import styles from "./Footer.module.css"

const help = ["Shipping", "Returns", "Warranty", "Contact"]
const company = ["About VICKAR", "Careers", "Press", "Sustainability"]

export function Footer() {
  const { shop } = useShop()
  const { categories, published } = useCatalog()

  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.top}>
          <div className={styles.brand}>
            <LogoMark size={44} animate={false} />
            <p className={styles.claim}>
            Everything.
            <br />
            One <span className="t-serif">store.</span>
            </p>
          </div>

          <nav className={styles.columns} aria-label="Footer">
            <div>
              <h2 className="t-label t-soft">Shop</h2>
              <ul>
                {categories.filter((c) => published.some((p) => p.category === c.id)).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => shop(c.id)}>
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="t-label t-soft">Help</h2>
              <ul>
                {help.map((l) => (
                  <li key={l}>
                    <a href="#/">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="t-label t-soft">Company</h2>
              <ul>
                {company.map((l) => (
                  <li key={l}>
                    <a href="#/">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <p className={styles.wordmark} aria-hidden="true">
          VICKAR
        </p>

        <div className={styles.legal}>
          <p className="t-label t-soft">© 2026 VICKAR</p>
          <p className="t-label t-soft">Instagram · TikTok · Pinterest</p>
        </div>
      </div>
    </footer>
  )
}
