import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Fidele-client discount, decided on the ORDER DETAILS after the order exists.
// Comptoir OR technicien can say yes / no. A "no" can later be changed to "yes" by the other one
// (until the order is delivered or cancelled). The price is NOT reset by a discount:
// the comptoir does not have to confirm the final price again.
// Props: order (needs id, client_id, status, final_price, discount, discount_percent, discount_decision)
//        onChanged(updates)  -> called with { discount, discount_percent, discount_decision }
export default function FideleDiscount({ order, onChanged, className = 'mb-4' }) {
  // The fetched client is stored together with the id it belongs to. If the order changes, the old
  // row simply stops matching and `client` becomes null — no setState needed inside an effect.
  const [clientRow, setClientRow] = useState(null) // { id, data }
  const client = clientRow?.id === order.client_id ? clientRow.data : null

  // What the user typed in the % box, tied to the order it was typed for.
  const [edit, setEdit] = useState(null) // { orderId, value }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const decision = order.discount_decision || null // null | 'applied' | 'declined'
  const closed = order.status === 'delivered' || order.status === 'cancelled'

  // The % shown is derived, not stored: typed value > percent already applied > the client's own % > 10.
  const appliedPct = Number(order.discount_percent) || 0
  const defaultPct = appliedPct > 0 ? appliedPct : Number(client?.fidele_percent) || 10
  const pct = edit?.orderId === order.id ? edit.value : defaultPct

  useEffect(() => {
    if (!order.client_id) return undefined
    let alive = true
    supabase.from('clients').select('full_name, is_fidele, fidele_percent, visits_count')
      .eq('id', order.client_id).maybeSingle()
      .then(({ data }) => { if (alive) setClientRow({ id: order.client_id, data }) }) // async callback: fine
    return () => { alive = false }
  }, [order.id, order.client_id])

  if (!client?.is_fidele && decision !== 'applied') return null

  async function decide(apply) {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('set_order_discount', {
      p_order: order.id, p_apply: apply, p_percent: apply ? Number(pct) : null,
    })
    if (error) { setBusy(false); setErr(error.message); return }
    const { data } = await supabase.from('repair_orders')
      .select('discount, discount_percent, discount_decision').eq('id', order.id).single()
    setBusy(false)
    setEdit(null) // go back to the derived default (the percent that was just saved)
    if (data && onChanged) onChanged(data)
  }

  const money = (n) => `${Number(n).toFixed(2).replace(/\.00$/, '')} د.ت`
  const price = order.final_price != null ? Number(order.final_price) : null
  const disc = Number(order.discount) || 0
  const errLine = err && <p className="text-xs text-[#b3170f] mt-2">{err}</p>

  const pctInput = (
    <>
      <input type="number" min="0" max="100" value={pct}
        onChange={(e) => setEdit({ orderId: order.id, value: e.target.value })}
        className="w-20 px-2 py-1.5 border border-[#e5e5e5] rounded-lg text-sm bg-white" />
      <span className="text-sm">%</span>
    </>
  )

  if (decision === 'applied') {
    return (
      <div className={`rounded-xl border-2 border-[#1f8a4c] bg-[#e8f6ee] p-4 ${className}`}>
        <p className="font-bold text-sm text-[#1f8a4c]">⭐ تخفيض فيديل {Number(order.discount_percent)}% مُطبَّق</p>
        {price != null && (
          <p className="text-xs text-[#1a1a1a] mt-1">
            {money(price)} − {money(disc)} = <b>{money(price - disc)}</b>
          </p>
        )}
        {!closed && (
          <button onClick={() => decide(false)} disabled={busy}
            className="mt-3 text-xs font-semibold border border-[#1f8a4c] text-[#1f8a4c] rounded-lg px-3 py-1.5 disabled:opacity-60">
            إلغاء التخفيض
          </button>
        )}
        {errLine}
      </div>
    )
  }

  if (decision === 'declined') {
    return (
      <div className={`rounded-xl border border-[#e5e5e5] bg-[#faf9f5] p-4 ${className}`}>
        <p className="font-bold text-sm">⭐ عميل فيديل — تم رفض التخفيض</p>
        {!closed && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {pctInput}
            <button onClick={() => decide(true)} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-[#1f8a4c] text-white text-xs font-semibold disabled:opacity-60">
              نعم، طبّق التخفيض
            </button>
          </div>
        )}
        {errLine}
      </div>
    )
  }

  // no decision yet
  return (
    <div className={`rounded-xl border-2 border-[#e4b73b] bg-[#fff8e1] p-4 ${className}`}>
      <p className="font-bold text-sm">⭐ هذا العميل فيديل ({client.visits_count} زيارات)</p>
      <p className="text-xs text-[#6b6b6b] mt-0.5">هل تطبّق عليه التخفيض؟</p>
      {closed ? null : (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {pctInput}
          <button onClick={() => decide(true)} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-[#1f8a4c] text-white text-xs font-semibold disabled:opacity-60">نعم، طبّق</button>
          <button onClick={() => decide(false)} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white text-xs font-semibold disabled:opacity-60">لا</button>
        </div>
      )}
      {errLine}
    </div>
  )
}