// Light / dark mode. The choice is saved on the device; until the person chooses,
// the phone or computer setting decides. The "dark" class on <html> switches everything
// (see src/styles/dark.css). index.html applies it before the page is drawn, so there is no white flash.
const KEY = 'm4u-theme'

function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}

export function getStoredTheme() {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'dark' || s === 'light') return s
  } catch { /* storage blocked */ }
  return null
}

export function getTheme() {
  return getStoredTheme() || (systemPrefersDark() ? 'dark' : 'light')
}

export function applyTheme(mode) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
  // the browser bar on the phone follows the theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#121212' : '#e4211b')
}

export function setTheme(mode) {
  try { localStorage.setItem(KEY, mode) } catch { /* ignore */ }
  applyTheme(mode)
  window.dispatchEvent(new Event('m4u-theme'))
}
