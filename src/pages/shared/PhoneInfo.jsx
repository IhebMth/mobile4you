import { phoneOf, CONDITION_LABEL } from '../../lib/phoneDetails'

// Phone details chips. compact (default): condition + battery.
// full: also warranty days and the IMEI line — used where staff need every detail.
// Never shows purchase price, supplier or where the phone was bought from.
export default function PhoneInfo({ item, full = false, className = '' }) {
  const pd = phoneOf(item)
  if (item?.category !== 'phone' || !pd) return null
  const chip = 'text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap'
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {pd.condition && (
          <span className={`${chip} ${pd.condition === 'new' ? 'bg-[#e8f6ee] text-[#1f8a4c]' : 'bg-[#f3f1ea] text-[#6b6b6b]'}`}>
            {CONDITION_LABEL[pd.condition] || pd.condition}
          </span>
        )}
        {pd.battery_health != null && (
          <span className={`${chip} bg-[#f3f1ea] text-[#6b6b6b]`}>🔋 {pd.battery_health}%</span>
        )}
        {full && Number(pd.internal_warranty_days) > 0 && (
          <span className={`${chip} bg-[#eaf1fe] text-[#2f6fed]`}>🛡️ ضمان {pd.internal_warranty_days} يوم</span>
        )}
      </div>
      {full && pd.imei && (
        <p className="text-xs text-[#6b6b6b] mt-1.5" dir="ltr">IMEI: <span className="font-semibold text-[#1a1a1a]">{pd.imei}</span></p>
      )}
    </div>
  )
}