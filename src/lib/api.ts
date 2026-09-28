/** Client for the VICKAR server functions (api/*.ts on Vercel). */

export type Address = {
  name: string
  email: string
  phone?: string
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export type ShippingRate = {
  id: string
  name: string
  provider: "easyship" | "flat"
  amount: number
  currency: string
  minDays: number | null
  maxDays: number | null
}

export type CartItem = { productId: string; color: string; qty: number }

export type OrderSummary = {
  number: string
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded"
  email: string
  customer_name: string
  items: { name: string; colorName: string; qty: number; unitPrice: number }[]
  subtotal: number
  shipping: number
  total: number
  shipping_method: ShippingRate | null
  tracking_url: string | null
  created_at: string
}

export class ApiError extends Error {}

const SERVER_MISSING =
  "Checkout runs on the server. Run the project with `vercel dev` locally, or use the deployed site."

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } })
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.")
  }
  const isJson = res.headers.get("content-type")?.includes("application/json")
  if (!isJson) throw new ApiError(SERVER_MISSING) // e.g. plain `vite` dev server: no /api routes
  const data = await res.json()
  if (!res.ok) throw new ApiError(data?.error ?? "Something went wrong. Please try again.")
  return data as T
}

export const api = {
  shippingRates: (items: CartItem[], address: Address) =>
    request<{ subtotal: number; rates: ShippingRate[] }>("/api/shipping-rates", {
      method: "POST",
      body: JSON.stringify({ items, address }),
    }),
  /** Requires a signed-in customer: the server verifies the token and links the order to the account. */
  checkout: (items: CartItem[], address: Address, rateId: string, token: string | null) =>
    request<{ url: string; number: string }>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ items, address, rateId }),
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    }),
  order: (sessionId: string) => request<OrderSummary>(`/api/order?session_id=${encodeURIComponent(sessionId)}`),
}
