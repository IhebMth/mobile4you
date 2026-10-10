// Service worker: wakes up when a push arrives, even if the site is closed.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Required by some browsers (Chrome / Brave on Android) before they offer "Install app".
// It does nothing: every request goes to the network as usual.
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data.json()
  } catch {
    d = {}
  }
  event.waitUntil((async () => {
    // Android / desktop: if the app is open on screen, the in-app toast already shows it.
    // iPhone requires every push to show a notification, so we never skip there.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const isApple = /iPhone|iPad|iPod/.test(self.navigator.userAgent)
    if (!isApple && wins.some((w) => w.visibilityState === 'visible')) return
    await self.registration.showNotification(d.title || 'Mobile 4 You', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',   // small white silhouette in the Android status bar
      tag: d.tag,
      data: { url: d.url || '/' },
      dir: 'rtl',
      lang: 'ar',
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'navigate', url }); return }
    }
    await self.clients.openWindow(url)
  })())
})
