import { priceCart, validateAddress, type Address, type CartItemInput } from "./_lib/cart.js"
import { handle, json, readJson } from "./_lib/http.js"
import { getRates } from "./_lib/shipping.js"

/** POST /api/shipping-rates  { items, address }  →  { subtotal, rates } */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ items: CartItemInput[]; address: Partial<Address> }>(request)
    const address = validateAddress(body.address)
    const { lines, subtotal } = await priceCart(body.items)
    const rates = await getRates(address, lines, subtotal)
    return json({ subtotal, rates })
  })
}
