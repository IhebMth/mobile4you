import { supabase } from './supabaseClient'

// Public key made with:  npx web-push generate-vapid-keys   (set it in Vercel as VITE_VAPID_PUBLIC_KEY)
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function keyToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

// 'default' | 'granted' | 'denied' | 'ios-install' | 'unsupported'
export function pushState() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!ok) return isIOS && !isStandalone ? 'ios-install' : 'unsupported'
  return Notification.permission
}

export function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

async function save(sub) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent,
  })
  if (error) throw error
}

// Call from a button tap (browsers only allow the permission popup after a tap).
export async function enablePush() {
  if (!KEY) throw new Error('VITE_VAPID_PUBLIC_KEY is missing')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(KEY) }))
  await save(sub)
  return 'granted'
}

// On every login: if this phone already allowed notifications, attach it to the logged-in person.
export async function syncPush() {
  if (pushState() !== 'granted') return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await save(sub)
}
