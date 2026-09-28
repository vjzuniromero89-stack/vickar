# VICKAR — Guía de puesta en marcha

Esta guía conecta la tienda con **GitHub → Supabase → Stripe → Easyship → Vercel**.
Hazla en este orden. Tiempo aproximado: 45–60 minutos.

> **Modo demo:** sin las variables de entorno, la tienda y el admin funcionan en tu navegador
> (los cambios se guardan solo ahí y no hay contraseña). Al conectar Supabase pasa a modo real
> automáticamente, sin cambiar código.

---

## Cómo funciona (resumen)

| Pieza | Qué hace |
|---|---|
| **Tienda** (`src/`) | React + Vite + Motion. Página única con hero, catálogo, búsqueda, ficha de producto, bolsa y checkout. |
| **Admin** (`#/admin`) | Productos, categorías, fotos, stock, envío y pedidos. Acceso con email + contraseña (Supabase Auth). |
| **Supabase** | Base de datos (productos, categorías, pedidos, admins), fotos (Storage) y login. Seguridad por Row Level Security. |
| **Funciones de servidor** (`api/`) | Corren en Vercel. Calculan envío, recalculan precios, crean el pago en Stripe y registran el pedido. |
| **Stripe** | Cobro con tarjeta, Apple Pay, Google Pay, etc. Nunca vemos datos de tarjeta. |
| **Easyship** | Tarifas de envío reales (DHL, FedEx, UPS, USPS…) y creación del envío al pagarse el pedido. Opcional: sin él se usan tarifas fijas. |

Flujo de compra: bolsa → dirección → tarifas de envío → **Stripe** → Stripe avisa a `/api/stripe-webhook`
→ pedido marcado **pagado**, stock descontado, envío creado en Easyship → aparece en **Admin → Orders**.

---

## 1. GitHub

1. Crea un repositorio **privado** vacío en <https://github.com/new> (por ejemplo `vickar`). No añadas README.
2. En la carpeta del proyecto (el repositorio local ya está inicializado con un primer commit):

```bash
git remote add origin https://github.com/TU-USUARIO/vickar.git
```

```bash
git push -u origin main
```

`.env.local` y otros secretos están en `.gitignore`: **nunca** se suben.

---

## 2. Supabase (base de datos, fotos y login)

1. Crea un proyecto en <https://supabase.com/dashboard> (región cercana a tus clientes; guarda la contraseña de la base de datos).
2. **SQL Editor → New query** → pega **todo** el archivo [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Crea las tablas, la seguridad, el bucket de fotos `product-images` y los productos demo (puedes borrarlos luego desde el admin).
3. **Crea tu usuario admin:** Authentication → Users → **Add user** → email + contraseña → marca *Auto confirm user*.
4. **Hazte admin:** SQL Editor → ejecuta (con tu email):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'tu@email.com'
on conflict do nothing;
```

5. **Authentication → URL Configuration:** en *Site URL* pon tu dominio de Vercel (lo tendrás en el paso 5; vuelve aquí después).
6. **Copia las claves** (Project Settings → API keys y Data API):
   - Project URL → `VITE_SUPABASE_URL` **y** `SUPABASE_URL`
   - Publishable key (`sb_publishable_…`, o la antigua *anon*) → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Secret key (`sb_secret_…`, o la antigua *service_role*) → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **solo servidor, nunca con `VITE_`**

---

## 3. Stripe (pagos)

1. Crea la cuenta en <https://dashboard.stripe.com>. Trabaja primero en **modo de prueba** (Test mode).
2. Developers → **API keys** → copia la *Secret key* (`sk_test_…`) → `STRIPE_SECRET_KEY`.
3. El **webhook** se configura después del primer despliegue (paso 5.4), porque necesita tu URL.
4. Settings → Payment methods: activa los métodos que quieras (tarjeta, Apple Pay, Google Pay, Link…).
5. Settings → Business → Public details / Branding: nombre **VICKAR**, logo y colores (el recibo y la página de pago los usan).

---

## 4. Easyship (envíos) — opcional

Sin Easyship la tienda usa **tarifas fijas** (Standard $6.95, gratis desde $75 en tu país; Express $14.95; internacional $19.95 / $39.95).
Puedes cambiar el umbral con `FREE_SHIPPING_THRESHOLD`.

Para tarifas reales de transportistas:

1. Crea la cuenta en <https://www.easyship.com> y conecta/activa los transportistas que usarás.
2. Connect → **API** → crea un token con permisos de **rates (lectura)** y **shipments/labels (escritura)** → `EASYSHIP_API_TOKEN`.
3. Rellena tu dirección de envío (almacén) en las variables `SHIP_FROM_*` (nombre, email, teléfono, calle, ciudad, estado, código postal, país ISO de 2 letras).
4. En el admin, completa en cada producto **peso empacado, medidas de la caja y código HS** (aduanas). Los productos demo ya los tienen.

Al pagarse un pedido, se crea el envío en Easyship con el transportista que eligió el cliente. Compras la etiqueta desde Easyship
y pones el número de seguimiento en **Admin → Orders** (o se guarda solo si Easyship lo devuelve).

---

## 5. Vercel (publicar)

1. <https://vercel.com/new> → **Import** tu repositorio de GitHub. Vercel detecta **Vite** solo (el `vercel.json` ya está listo).
2. Antes de *Deploy*, abre **Environment Variables** y añade (para *Production* y *Preview*):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_URL` | Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key ⚠️ |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | (lo añades en el paso 4 de esta sección) |
| `SITE_URL` | `https://tu-proyecto.vercel.app` o tu dominio |
| `FREE_SHIPPING_THRESHOLD` | `75` |
| `EASYSHIP_API_TOKEN` + `SHIP_FROM_*` | opcional (paso 4) |

3. **Deploy.** Copia la URL final (p. ej. `https://vickar.vercel.app`), ponla en `SITE_URL` y en Supabase → *Site URL*.
4. **Webhook de Stripe:** Developers → Webhooks → **Add endpoint**
   - URL: `https://TU-DOMINIO/api/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`
   - Copia el **Signing secret** (`whsec_…`) → variable `STRIPE_WEBHOOK_SECRET` en Vercel.
5. En Vercel → Deployments → **Redeploy** (las variables nuevas se aplican al redesplegar).
6. Dominio propio: Vercel → Settings → Domains. Después actualiza `SITE_URL`, Supabase *Site URL* y la URL del webhook.

---

## 6. Prueba de compra (modo test)

1. Entra a `https://TU-DOMINIO/#/admin` con tu email y contraseña → deberías ver el Dashboard (sin el aviso de "Demo mode").
2. En la tienda, añade un producto a la bolsa → **Checkout** → dirección → elige envío → **Pay**.
3. En Stripe usa la tarjeta de prueba **4242 4242 4242 4242**, cualquier fecha futura, cualquier CVC.
4. Vuelves a la página de confirmación ("Thank you…"). En **Admin → Orders** aparece como **Paid · to ship**, y el stock se descontó.
5. Si no aparece: Stripe → Webhooks → tu endpoint → revisa los intentos; Vercel → Logs de la función.

---

## 7. Salir a producción (cobros reales)

- [ ] Stripe: completa la activación de la cuenta; cambia a **live** → nueva `STRIPE_SECRET_KEY` (`sk_live_…`) y **nuevo webhook live** con su `whsec_…`.
- [ ] Borra los productos demo y sube los reales con fotos, peso, medidas y código HS.
- [ ] Revisa tarifas de envío / umbral de envío gratis y los países del checkout (`src/data/countries.ts`).
- [ ] Añade páginas legales (términos, privacidad, envíos y devoluciones) y enlázalas en el footer.
- [ ] Impuestos: activa **Stripe Tax** si vendes donde debes cobrar impuestos (requiere un cambio pequeño en `api/checkout.ts`: `automatic_tax: { enabled: true }`).
- [ ] Prueba una compra real de bajo importe y reembólsala desde Stripe.

---

## Desarrollo local

```bash
npm install
```

Solo la tienda y el admin (modo demo, sin servidor):

```bash
npm run dev
```

Con las funciones de servidor (checkout real contra tus claves de prueba): instala la CLI de Vercel,
enlaza el proyecto y descarga las variables:

```bash
npm i -g vercel
```

```bash
vercel link
```

```bash
vercel env pull .env.local
```

```bash
vercel dev
```

Para recibir webhooks en local usa la CLI de Stripe: `stripe listen --forward-to localhost:3000/api/stripe-webhook`.

---

## Mapa del código

```
api/                    Funciones de servidor (Vercel)
  checkout.ts           Crea pedido + sesión de pago Stripe
  shipping-rates.ts     Tarifas (Easyship o fijas)
  stripe-webhook.ts     Stripe → pedido pagado, stock, envío
  order.ts              Confirmación para el cliente
  _lib/                 Utilidades compartidas (no son rutas)
supabase/schema.sql     Base de datos, seguridad, fotos y datos demo
src/
  pages/                Home, Producto, Checkout, Confirmación
  admin/                Panel de administración
  sections/             Hero, catálogo, newsletter…
  components/           UI, producto, bolsa, búsqueda, logo
  state/                Catálogo, bolsa, rutas, tienda
  lib/                  Supabase, API del checkout, backend del catálogo
  motion/ · styles/     Tokens de animación y diseño
```
