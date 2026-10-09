import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import FideleDiscount from '../shared/FideleDiscount'

// Technicien only moves an order through the REPAIR phases. "جاهز للاستلام",
// "تم التسليم" and "ملغى" are comptoir's decision (comptoir is the one who
// actually hands the device back and takes the money), set from
// ComptoirDashboard.jsx instead. The database also blocks this directly
// (see SQL Script N) so it can't be bypassed even by calling the API.
const STATUS_OPTIONS = [
  { value: 'received', label: 'استُلم' },
  { value: 'diagnosing', label: 'تشخيص' },
  { value: 'in_repair', label: 'قيد الإصلاح' },
]

export default function RepairDetails() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [priceError, setPriceError] = useState(null)

  useEffect(() => { loadOrder() }, [id])

  async function loadOrder() {
    setLoading(true)
    const { data } = await supabase
      .from('repair_orders')
      .select('*, clients(full_name, phone)')
      .eq('id', id)
      .single()
    setOrder(data)
    setPriceInput(data?.final_price ?? '')
    setLoading(false)
  }

  async function updateStatus(newStatus) {
    setSaving(true)
    const { error } = await supabase.from('repair_orders').update({ status: newStatus }).eq('id', id)
    setSaving(false)
    if (!error) loadOrder()
  }

  async function handleSavePrice() {
    if (!priceInput || Number(priceInput) <= 0) {
      setPriceError('دخّل سعر صحيح أكبر من صفر')
      return
    }
    setSavingPrice(true)
    setPriceError(null)

    const { error } = await supabase
      .from('repair_orders')
      .update({ final_price: Number(priceInput) })
      .eq('id', id)

    setSavingPrice(false)

    if (error) {
      setPriceError('خطأ: ' + error.message)
      return
    }
    loadOrder()
  }

  if (loading) return <p className="text-sm text-[#6b6b6b]">جاري التحميل...</p>
  if (!order) return <p className="text-sm text-[#6b6b6b]">الطلب غير موجود</p>

  // once comptoir has moved it to ready / delivered / cancelled, it's out of
  // the technicien's hands entirely — show it read-only instead of a dropdown
  // that would silently fail against the database guard
  const stillInRepairPhase = STATUS_OPTIONS.some((s) => s.value === order.status)

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1" dir="ltr" style={{ textAlign: 'right' }}>
          {order.order_number}
        </h1>
        <p className="text-sm text-[#6b6b6b]">{order.device_model} — {order.clients?.full_name}</p>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-5 items-start">
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-6">
          <Row label="الحريف" value={`${order.clients?.full_name} — ${order.clients?.phone}`} />
          <Row label="الجهاز" value={order.device_model} />
          <Row label="وصف العطل" value={order.issue_description} />
          <Row label="السعر التقديري" value={order.price_min && order.price_max ? `${order.price_min} – ${order.price_max} د.ت` : '—'} />
          <Row label="تاريخ الاستقبال" value={new Date(order.created_at).toLocaleDateString('ar-TN')} last />
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-6">
            <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-3 border-b border-[#e5e5e5]">تغيير الحالة</h3>
            {stillInRepairPhase ? (
              <select value={order.status} onChange={(e) => updateStatus(e.target.value)} disabled={saving} className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-[#1a1a1a] text-sm font-semibold text-[#1a1a1a] bg-white">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[#6b6b6b]">
                الطلب خرج من مرحلة التصليح ({order.status === 'delivered' ? 'تم التسليم' : order.status === 'ready' ? 'جاهز للاستلام' : 'ملغى'}) —
                التسليم والإلغاء يتم من طرف الاستقبال.
              </p>
            )}
          </div>

          <div className="bg-white border border-[#e5e5e5] rounded-xl p-6">
            <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-3 border-b border-[#e5e5e5]">السعر النهائي</h3>
            <div className="flex gap-2">
              <input type="number" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="مثال: 120" className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" />
              <button onClick={handleSavePrice} disabled={savingPrice} className="bg-[#1a1a1a] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60 whitespace-nowrap">
                {savingPrice ? '...' : 'حفظ'}
              </button>
            </div>
            {priceError && <p className="text-[#b3170f] text-xs mt-2">{priceError}</p>}
            {order.final_price != null && (
              <p className={`text-xs mt-2 ${order.price_confirmed ? 'text-green-700' : 'text-[#b3170f]'}`}>
                {order.price_confirmed ? '✔ مؤكد من الاستقبال' : '● بانتظار تأكيد الاستقبال'}
              </p>
            )}
          </div>

          {/* fidele client: apply the discount? (technicien OR comptoir can answer) */}
          <FideleDiscount order={order} onChanged={loadOrder} className="" />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, last }) {
  return (
    <div className={`flex justify-between py-2.5 text-sm ${!last ? 'border-b border-[#ececE4]' : ''}`}>
      <span className="text-[#6b6b6b]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
