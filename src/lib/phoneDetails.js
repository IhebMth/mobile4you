import { t } from '../i18n/LanguageContext'
// Supabase returns the phone_details relation either as an object or as a 1-item array,
// depending on how it detects the relation. This always gives back ONE object (or null).
export function phoneOf(item) {
  const pd = item && item.phone_details
  if (!pd) return null
  return Array.isArray(pd) ? pd[0] || null : pd
}

export const CONDITION_LABEL = { new: t('Neuf'), used: t('Occasion') }
export const SOURCE_LABEL = { supplier: t('Morred'), client_trade_in: t('شراء من حريف') }