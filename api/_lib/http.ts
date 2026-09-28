/** Small helpers for Web-standard Vercel Functions. Files under api/_lib are not deployed as routes. */

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Runs a handler, turning thrown HttpErrors into JSON responses and hiding unexpected details. */
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: "Something went wrong on our side. Please try again." }, 500)
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "Invalid request body.")
  }
}

/** Required server env var — fails loudly (500) with a clear message if it's missing. */
export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new HttpError(500, `Server is not configured: missing ${name}.`)
  return v
}

export const optionalEnv = (name: string) => process.env[name] || undefined

/** Public site URL, used for Stripe redirects. Falls back to the request origin. */
export function siteUrl(request: Request) {
  return (optionalEnv("SITE_URL") ?? new URL(request.url).origin).replace(/\/$/, "")
}
