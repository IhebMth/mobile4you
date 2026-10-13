import { phoneOf, CONDITION_LABEL } from '../../lib/phoneDetails'
import { t } from '../../i18n/LanguageContext'

// One line of phone details (condition, battery, warranty, source). Renders nothing for accessories.
// compact (default): condition + battery        full: + internal warranty + where it came from
// <PhoneInfo item={row} full className="mt-1" />
export default function PhoneInfo({ item, full = false, className = '' }) {
  if (!item || item.category !== 'phone') return null
  const pd = phoneOf(item)
  if (!pd) return null
  const bits = []
  if (pd.condition) bits.push(CONDITION_LABEL[pd.condition] || pd.condition)
  if (pd.battery_health !== null && pd.battery_health !== undefined && pd.battery_health !== '') {
    bits.push(`🔋 ${pd.battery_health}%`)
  }
  if (full && Number(pd.internal_warranty_days) > 0) bits.push(t('🛡️ Garantie {internal_warranty_days} jours', { internal_warranty_days: pd.internal_warranty_days }))
  if (full && pd.source_type) bits.push(pd.source_type === 'client_trade_in' ? t('D\'un client (reprise)') : t('D\'un fournisseur'))
  if (!bits.length) return null
  return <p className={`text-[11px] text-[#6b6b6b] ${className}`}>{bits.join(' · ')}</p>
}
