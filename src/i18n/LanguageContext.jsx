import { createContext, useContext, useEffect, useMemo } from 'react'
import en from './en'

/* eslint-disable react-refresh/only-export-components */

// Two languages: French (default) and English.
// The KEY of every text is its French wording, so:
//   t('Commandes')                       -> "Commandes" (fr)  /  "Orders" (en)
//   t('il y a {m} min', { m: 5 })        -> "il y a 5 min"    /  "5 min ago"
// A text with no English entry simply stays in French — it is never blank.
// If two French texts are identical but mean different things in English, add "|context"
// to the key (e.g. 'Reçu|reçu de caisse'): the part after | is never displayed.
//
// t() can be imported and used ANYWHERE (inside a component, in a helper, or in a list at the top
// of a file). Changing the language reloads the page once, so everything — including those lists
// at the top of files — is rebuilt in the new language. The choice is saved on the device.

const STORAGE_KEY = 'm4u-lang'
export const LANGUAGES = ['fr', 'en']
const DICTIONARIES = { fr: {}, en }
const LOCALES = { fr: 'fr-FR', en: 'en-GB' }

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (LANGUAGES.includes(saved)) return saved
  } catch { /* storage blocked: ignore */ }
  return 'fr' // French first, whatever the phone language is
}

// read once when the app loads (before any page code runs)
const current = readSavedLang()
if (typeof document !== 'undefined') {
  document.documentElement.lang = current
  document.documentElement.dir = 'ltr' // French and English both read left to right
}

export function getLang() { return current }
export function getLocale() { return LOCALES[current] }

export function t(key, vars) {
  if (key == null) return ''
  const raw = String(key)
  const dict = DICTIONARIES[current] || {}
  let text = Object.prototype.hasOwnProperty.call(dict, raw) ? dict[raw] : raw
  // "Reçu|context" -> hide the context part when no translation exists
  if (text === raw && raw.includes('|')) text = raw.split('|')[0]
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m))
  }
  return text
}

export function setLang(next) {
  if (!LANGUAGES.includes(next) || next === current) return
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  window.location.reload()
}

const LanguageContext = createContext({ lang: 'fr', setLang, t, locale: 'fr-FR' })

export function LanguageProvider({ children }) {
  useEffect(() => {
    document.documentElement.lang = current
  }, [])
  const value = useMemo(() => ({ lang: current, setLang, t, locale: LOCALES[current] }), [])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// const { t, lang, locale, setLang } = useI18n()   (same t as the one you can import directly)
export function useI18n() {
  return useContext(LanguageContext)
}
