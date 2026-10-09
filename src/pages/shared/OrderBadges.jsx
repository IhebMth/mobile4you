import { paymentOf, formatEta } from '../../lib/orderPayment'

// Small colored badge: paid / partial (with the amount still owed).
// Nothing is shown before delivery, because payment only happens at pickup.
export function PaymentBadge({ order }) {
  const { state, remaining } = paymentOf(order)
  if (state === 'pending') return null
  const cls = state === 'paid' ? 'bg-[#e8f6ee] text-[#1f8a4c]' : 'bg-[#fff4e0] text-[#b36b00]'
  return (
    <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${cls}`}>
      {state === 'paid' ? '✅ خالص' : `⚠️ باقي ${remaining.toFixed(2)} د.ت`}
    </span>
  )
}

// "The client confirmed he will come" — shown while the device is ready.
export function PickupBadge({ order }) {
  if (!order.client_acknowledged || order.status !== 'ready') return null
  const eta = formatEta(order.client_pickup_eta)
  return (
    <span className="text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap bg-[#eaf1fe] text-[#2f6fed]">
      🙋 الحريف باش يجي{eta ? ` · ${eta}` : ''}
    </span>
  )
}

// Modal block: total / paid / remaining. Shown once the technician has set a final price.
export function PaymentSummary({ order }) {
  const { state, total, paid, remaining } = paymentOf(order)
  if (total == null) return null
  const row = 'flex justify-between text-sm py-1'
  return (
    <div className="bg-[#faf9f5] rounded-lg p-3 mt-3">
      <h4 className="text-xs font-bold text-[#e4211b] mb-1.5">الدفع</h4>
      <div className={row}><span className="text-[#6b6b6b]">الإجمالي</span><b>{total.toFixed(2)} د.ت</b></div>
      {state === 'pending' ? (
        <p className="text-xs text-[#6b6b6b] pt-1">ما خلّصش بعد — يخلّص عند استلام الجهاز.</p>
      ) : (
        <>
          <div className={row}><span className="text-[#6b6b6b]">خلّص</span><b className="text-[#1f8a4c]">{paid.toFixed(2)} د.ت</b></div>
          <div className={row}>
            <span className="text-[#6b6b6b]">الباقي</span>
            <b className={remaining > 0 ? 'text-[#b36b00]' : 'text-[#1f8a4c]'}>{remaining > 0 ? `${remaining.toFixed(2)} د.ت` : '✅ خالص'}</b>
          </div>
        </>
      )}
    </div>
  )
}
