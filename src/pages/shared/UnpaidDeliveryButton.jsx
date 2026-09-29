import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Drop into the order modal in ComptoirDashboard (comptoir + admin).
// order = the selected order (needs id, final_price, price_confirmed, status)
export default function UnpaidDeliveryButton({ order, onDone }) {
  const [open, setOpen] = useState(false)
  const [unpaid, setUnpaid] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  if (!order.price_confirmed) return null   // price must be confirmed first

  async function submit() {
    setError(null)
    setSaving(true)
    const { error: err } = await supabase.rpc('mark_order_unpaid', {
      p_order: order.id, p_unpaid: Number(unpaid), p_deliver: order.status !== 'delivered',
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpen(false)
    setUnpaid('')
    onDone?.()
  }

  return open ? (
    <div className="mt-3 p-3 border border-[#e5e5e5] rounded-lg bg-[#fff8f0]">
      <label className="block text-sm font-semibold mb-1.5">
        كم ما خلّصش الحريف؟ (من أصل {order.final_price} د.ت)
      </label>
      <input type="number" step="0.001" value={unpaid} onChange={(e) => setUnpaid(e.target.value)}
        className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm mb-2" />
      {error && <p className="text-[#b3170f] text-xs mb-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving}
          className="bg-[#c9750a] text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60">
          {order.status === 'delivered' ? 'سجّل الدين' : 'سلّم وسجّل الدين'}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs px-3">إلغاء</button>
      </div>
    </div>
  ) : (
    <button onClick={() => setOpen(true)} className="mt-3 text-[#c9750a] text-sm font-semibold hover:underline">
      {order.status === 'delivered' ? '⚠ الحريف ما خلّصش كامل' : 'تسليم بدون دفع كامل'}
    </button>
  )
}
