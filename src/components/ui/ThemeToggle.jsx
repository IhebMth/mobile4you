import { useEffect, useState } from 'react'
import '../../styles/dark.css'
import { applyTheme, getStoredTheme, getTheme, setTheme } from '../../lib/theme'
import { t } from '../../i18n/LanguageContext'

// Round sun / moon button. Sits next to the FR | EN switch.
//   <ThemeToggle />          light backgrounds
//   <ThemeToggle onDark />   dark backgrounds (the phone top bar)
export default function ThemeToggle({ onDark = false }) {
  const [mode, setMode] = useState(getTheme)

  // same page in another tab changed it / the phone switched to night mode (only while no choice was made)
  useEffect(() => {
    const sync = () => setMode(getTheme())
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const onSystem = () => { if (!getStoredTheme()) { applyTheme(getTheme()); sync() } }
    window.addEventListener('m4u-theme', sync)
    window.addEventListener('storage', sync)
    media?.addEventListener?.('change', onSystem)
    return () => {
      window.removeEventListener('m4u-theme', sync)
      window.removeEventListener('storage', sync)
      media?.removeEventListener?.('change', onSystem)
    }
  }, [])

  const isDark = mode === 'dark'
  const label = isDark ? t('Passer en mode clair') : t('Passer en mode sombre')

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={`w-9 h-9 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
        onDark
          ? 'bg-white/10 border-white/10 text-white hover:bg-white/20'
          : 'bg-white border-[#e5e5e5] text-[#1a1a1a] hover:bg-[#faf9f5] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
      }`}
    >
      {isDark ? (
        /* sun */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* moon */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
