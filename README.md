# VICKAR

Everything, one store — a cinematic single-page storefront with a full admin, Stripe checkout and carrier shipping.

- **Stack:** React 19 · Vite · TypeScript · Motion (`motion/react`) · Supabase · Stripe · Easyship · Vercel Functions
- **Store:** scroll-driven "blueprint → product" hero, filterable catalogue, search (`/` or `Ctrl K`), product pages, bag, checkout
- **Admin:** `#/admin` — products, categories, photos, stock, shipping data, orders
- **Setup:** see **[SETUP.md](SETUP.md)** (GitHub → Supabase → Stripe → Easyship → Vercel)

```bash
npm install
```

```bash
npm run dev
```

Without environment variables the app runs in **demo mode** (catalogue saved in the browser, open admin).
With Supabase configured it switches to real data, real admin accounts and orders automatically.
