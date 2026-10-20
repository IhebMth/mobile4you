/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo } from 'react'
import enBase from './en'
import arBase from './ar'
import enCatalog from './en_catalog'
import arCatalog from './ar_catalog'
import { supabase } from '../lib/supabaseClient'

// Three languages: French (default), English and Arabic (right to left).
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
export const LANGUAGES = ['fr', 'en', 'ar']
// the catalogue texts are in their own files and merged here
const en = { ...enBase, ...enCatalog }
const ar = { ...arBase, ...arCatalog }
const DICTIONARIES = { fr: {}, en, ar }
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' }

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (LANGUAGES.includes(saved)) return saved
  } catch { /* storage blocked: ignore */ }
  return 'fr' // French first, whatever the phone language is
}

// read once when the app loads (before any page code runs)
const current = readSavedLang()
// Arabic reads right to left: the whole page is mirrored (menu, tables, arrows). French and English: left to right.
const DIR = current === 'ar' ? 'rtl' : 'ltr'
if (typeof document !== 'undefined') {
  document.documentElement.lang = current
  document.documentElement.dir = DIR
}

export function getLang() { return current }
export function getLocale() { return LOCALES[current] }
export function getDir() { return DIR }

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

// Notifications are translated by the database (columns title_fr / title_en / message_fr / message_en).
// This picks the one for the language in use; old rows without a translation show the original text.
// Arabic is the text the database triggers write, so it is shown as it is.
export function notifTitle(n) {
  if (current === 'ar') return n.title || n.title_fr || ''
  return (current === 'en' ? n.title_en : n.title_fr) || n.title_fr || n.title || ''
}
export function notifMessage(n) {
  if (current === 'ar') return n.message || n.message_fr || ''
  return (current === 'en' ? n.message_en : n.message_fr) || n.message_fr || n.message || ''
}

// Remember the language in the person's profile too, so the PHONE notifications arrive in it.
export async function saveLangToProfile(lang) {
  try {
    await Promise.race([
      supabase.rpc('set_my_lang', { p_lang: lang }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch { /* not signed in, or offline: the phone keeps its last language */ }
}

export async function setLang(next) {
  if (!LANGUAGES.includes(next) || next === current) return
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  await saveLangToProfile(next)
  window.location.reload()
}

const LanguageContext = createContext({ lang: 'fr', dir: 'ltr', setLang, t, locale: 'fr-FR' })

export function LanguageProvider({ children }) {
  useEffect(() => {
    document.documentElement.lang = current
    document.documentElement.dir = DIR
  }, [])
  const value = useMemo(() => ({ lang: current, dir: DIR, setLang, t, locale: LOCALES[current] }), [])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// const { t, lang, dir, locale, setLang } = useI18n()   (same t as the one you can import directly)
export function useI18n() {
  return useContext(LanguageContext)
}
