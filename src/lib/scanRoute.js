// Turns whatever a QR code contains into an in-app path, or null if it is not one of ours.
//   https://domain/o/ORD123   repair sticker   -> /o/ORD123
//   https://domain/p/<id>     stock label      -> /p/<id>
//   https://domain/track/<t>  client page      -> /track/<t>
//   ORD123                    plain order number typed/encoded without a link -> /o/ORD123
export function routeFromScan(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  if (/^ORD\d+$/i.test(raw)) return `/o/${raw.toUpperCase()}`
  let path = raw
  try {
    const u = new URL(raw)
    path = u.pathname + u.search
  } catch { /* not a URL: keep as is */ }
  return /^\/(o|p|track)\/[^/]+/.test(path) ? path : null
}
