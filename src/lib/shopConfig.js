// One place for shop details used on receipts / stickers / the public tracking page.
export const SHOP = {
  name: 'MOBILE 4 YOU',
  phone: '',            // e.g. '21 654 321' — printed on the receipt if filled
  address: '',          // optional
}

// The address the QR points to. In production set VITE_PUBLIC_URL in Vercel
// (e.g. https://mobile4you.vercel.app). On localhost a phone can't open the QR,
// so for testing use your computer's LAN address (e.g. http://192.168.1.20:5173).
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '')

export const trackUrl = (accessToken) => `${PUBLIC_URL}/track/${accessToken}`
export const scanUrl = (orderNumber) => `${PUBLIC_URL}/o/${orderNumber}`
export const productUrl = (productId) => `${PUBLIC_URL}/p/${productId}` // stock label QR (Phase 4b)
