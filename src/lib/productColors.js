import { t } from '../i18n/LanguageContext'

// The colour is saved in the database by its FRENCH name (e.g. "Noir"), whatever language the
// person uses, so the same product reads "Noir" or "Black" depending on the viewer.
// Old products saved with the Arabic name (أسود…) or typed in English still get their dot and
// their translated name. A colour typed by hand that is not in this list is shown as typed,
// with a neutral striped dot.
// [French name (saved), English name, Arabic name (old data), colour]
const DEFS = [
  ['Noir', 'Black', 'أسود', '#1a1a1a'],
  ['Blanc', 'White', 'أبيض', '#ffffff'],
  ['Gris', 'Grey', 'رمادي', '#8e8e93'],
  ['Argenté', 'Silver', 'فضي', '#c8c9cc'],
  ['Or', 'Gold', 'ذهبي', '#d4af37'],
  ['Bleu', 'Blue', 'أزرق', '#2f6fed'],
  ['Rouge', 'Red', 'أحمر', '#e4211b'],
  ['Vert', 'Green', 'أخضر', '#1f8a4c'],
  ['Rose', 'Pink', 'وردي', '#f58fb1'],
  ['Violet', 'Purple', 'بنفسجي', '#7b4fd6'],
  ['Orange', 'Orange', 'برتقالي', '#f08a24'],
  ['Beige', 'Beige', 'بيج', '#d9c7a3'],
]

// [name saved, colour] pairs for the colour picker in Stock
export const COLORS = DEFS.map(([fr, , , hex]) => [fr, hex])

function findDef(label) {
  const name = String(label || '').trim().toLowerCase()
  if (!name) return null
  return DEFS.find(([fr, en, ar]) => fr.toLowerCase() === name || en.toLowerCase() === name || ar === name) || null
}

export function colorHex(label) {
  const d = findDef(label)
  return d ? d[3] : null
}

// the name to display, in the current language
export function colorLabel(label) {
  const d = findDef(label)
  return d ? t(d[0]) : String(label || '').trim()
}
