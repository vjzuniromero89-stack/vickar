import type { Address, PricedLine } from "./cart.js"
import { round2 } from "./cart.js"
import { HttpError, optionalEnv } from "./http.js"

export type ShippingRate = {
  id: string
  name: string
  provider: "easyship" | "flat"
  amount: number
  currency: string
  minDays: number | null
  maxDays: number | null
  courierServiceId?: string
}

const EASYSHIP_API = "https://public-api.easyship.com/2024-09"

/** Ship-from address (your warehouse), configured with SHIP_FROM_* env vars. */
function originAddress() {
  const get = (k: string) => optionalEnv(`SHIP_FROM_${k}`)
  const origin = {
    contact_name: get("NAME"),
    contact_email: get("EMAIL"),
    contact_phone: get("PHONE"),
    company_name: get("COMPANY") ?? "VICKAR",
    line_1: get("LINE1"),
    line_2: get("LINE2"),
    city: get("CITY"),
    state: get("STATE"),
    postal_code: get("POSTAL_CODE"),
    country_alpha2: get("COUNTRY"),
  }
  const ready = origin.contact_name && origin.contact_email && origin.line_1 && origin.city && origin.country_alpha2
  return ready ? origin : null
}

function toEasyshipAddress(a: Address) {
  return {
    contact_name: a.name,
    contact_email: a.email,
    contact_phone: a.phone,
    line_1: a.line1,
    line_2: a.line2,
    city: a.city,
    state: a.state,
    postal_code: a.postalCode,
    country_alpha2: a.country,
  }
}

/** One parcel, one entry per line — weight/box per unit, customs value per unit. */
function toEasyshipItems(lines: PricedLine[]) {
  return lines.map((l) => ({
    description: `${l.name} (${l.colorName})`,
    quantity: l.qty,
    actual_weight: l.weightKg,
    dimensions: { length: l.lengthCm, width: l.widthCm, height: l.heightCm },
    declared_currency: "USD",
    declared_customs_value: l.unitPrice,
    ...(l.hsCode ? { hs_code: l.hsCode } : { category: "accessories" }),
  }))
}

async function easyship(path: string, body: unknown) {
  const token = optionalEnv("EASYSHIP_API_TOKEN")!
  const res = await fetch(`${EASYSHIP_API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error("Easyship error", res.status, JSON.stringify(data))
    throw new HttpError(502, "The shipping service didn't respond as expected. Please check your address and try again.")
  }
  return data
}

/** Flat rates — used when Easyship isn't configured, so the store still works end to end. */
function flatRates(subtotal: number, a: Address): ShippingRate[] {
  const threshold = Number(optionalEnv("FREE_SHIPPING_THRESHOLD") ?? 75)
  const domestic = a.country === (optionalEnv("SHIP_FROM_COUNTRY") ?? "US")
  const standard = subtotal >= threshold && domestic ? 0 : domestic ? 6.95 : 19.95
  return [
    { id: "flat-standard", name: domestic ? "Standard" : "International standard", provider: "flat", amount: standard, currency: "usd", minDays: domestic ? 3 : 7, maxDays: domestic ? 6 : 15 },
    { id: "flat-express", name: domestic ? "Express" : "International express", provider: "flat", amount: domestic ? 14.95 : 39.95, currency: "usd", minDays: domestic ? 1 : 3, maxDays: domestic ? 2 : 6 },
  ]
}

type EasyshipRate = {
  courier_service?: { id?: string; name?: string; umbrella_name?: string }
  courier_id?: string
  courier_name?: string
  total_charge: number
  currency: string
  min_delivery_time?: number
  max_delivery_time?: number
}

/** Live carrier rates from Easyship when configured; flat rates otherwise. */
export async function getRates(address: Address, lines: PricedLine[], subtotal: number): Promise<ShippingRate[]> {
  const origin = originAddress()
  if (!optionalEnv("EASYSHIP_API_TOKEN") || !origin) return flatRates(subtotal, address)

  const data = (await easyship("/rates", {
    origin_address: origin,
    destination_address: toEasyshipAddress(address),
    incoterms: "DDU",
    insurance: { is_insured: false },
    parcels: [{ items: toEasyshipItems(lines) }],
  })) as { rates?: EasyshipRate[] }

  const rates = (data.rates ?? [])
    .filter((r) => r.currency?.toUpperCase() === "USD" && Number.isFinite(Number(r.total_charge)))
    .map<ShippingRate>((r) => {
      const courierServiceId = r.courier_service?.id ?? r.courier_id ?? ""
      return {
        id: `es-${courierServiceId}`,
        name: r.courier_service?.name ?? r.courier_name ?? "Courier",
        provider: "easyship",
        amount: round2(Number(r.total_charge)),
        currency: "usd",
        minDays: r.min_delivery_time ?? null,
        maxDays: r.max_delivery_time ?? null,
        courierServiceId,
      }
    })
    .filter((r) => r.courierServiceId)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)

  if (rates.length === 0) throw new HttpError(422, "We can't ship to this address yet. Please check it or contact us.")
  return rates
}

/** Creates the shipment in Easyship after payment, with the courier the customer chose. */
export async function createShipment(order: {
  number: string
  shipping_address: Address
  items: PricedLine[]
  shipping_method: ShippingRate | null
}) {
  const origin = originAddress()
  if (!optionalEnv("EASYSHIP_API_TOKEN") || !origin) return null
  const data = (await easyship("/shipments", {
    platform_order_number: order.number,
    origin_address: origin,
    destination_address: toEasyshipAddress(order.shipping_address),
    incoterms: "DDU",
    insurance: { is_insured: false },
    ...(order.shipping_method?.courierServiceId ? { courier_service_id: order.shipping_method.courierServiceId } : {}),
    parcels: [{ items: toEasyshipItems(order.items) }],
  })) as {
    shipment?: { easyship_shipment_id?: string; tracking_page_url?: string; trackings?: { tracking_number?: string }[] }
  }
  return {
    shipmentId: data.shipment?.easyship_shipment_id ?? null,
    trackingUrl: data.shipment?.tracking_page_url ?? null,
    trackingNumber: data.shipment?.trackings?.[0]?.tracking_number ?? null,
  }
}
