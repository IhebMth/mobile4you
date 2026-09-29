import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import StatusBadge from '../../components/ui/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import UnpaidDeliveryButton from '../shared/UnpaidDeliveryButton'

const STATUS_OPTIONS = [
  { value: 'received', label: 'استُلم' },
  { value: 'diagnosing', label: 'تشخيص' },
  { value: 'in_repair', label: 'قيد الإصلاح' },
  { value: 'ready', label: 'جاهز للاستلام' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'cancelled', label: 'ملغى' },
]

export default function ComptoirDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)

  const [selectedOrder, setSelectedOrder] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [modalError, setModalError] = useState(null)

  // NOTE: the functions are declared BEFORE the useEffect that calls them
  // (fixes "Cannot access variable before it is declared").
  // loadOrders does not call setLoading(true) itself: "loading" starts as true,
  // and reloads after an action refresh the table silently (no flicker).
  async function loadOrders() {
    const { data } = await supabase
      .from('repair_orders')
      .select('id, order_number, device_model, issue_description, status, technician_id, price_min, price_max, final_price, price_confirmed, created_at, client_id, clients(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(50)
    setOrders(data || [])
    setLoading(false)
  }

  async function loadTechnicians() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technicien')
      .order('full_name')
    setTechnicians(data || [])
  }

  useEffect(() => {
    loadOrders()
    loadTechnicians()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openModal(order) {
    setSelectedOrder(order)
    setForm({
      clientName: order.clients?.full_name || '',
      clientPhone: order.clients?.phone || '',
      deviceModel: order.device_model || '',
      issueDescription: order.issue_description || '',
      priceMin: order.price_min ?? '',
      priceMax: order.price_max ?? '',
      technicianId: order.technician_id || '',
    })
    setModalError(null)
  }

  function closeModal() {
    setSelectedOrder(null)
    setForm(null)
    setModalError(null)
  }

  async function handleSaveEdits() {
    if (!form.clientName.trim() || !form.clientPhone.trim() || !form.deviceModel.trim() || !form.issueDescription.trim() || !form.technicianId) {
      setModalError('عمر كل الحقول الإجبارية')
      return
    }
    setSaving(true)
    setModalError(null)

    // 1) تحديث بيانات الحريف
    const { error: clientError } = await supabase
      .from('clients')
      .update({ full_name: form.clientName.trim(), phone: form.clientPhone.trim() })
      .eq('id', selectedOrder.client_id)

    if (clientError) {
      setSaving(false)
      setModalError('خطأ في تحديث الحريف: ' + clientError.message)
      return
    }

    // 2) تحديث بيانات الطلب
    const { error: orderError } = await supabase
      .from('repair_orders')
      .update({
        device_model: form.deviceModel.trim(),
        issue_description: form.issueDescription.trim(),
        price_min: form.priceMin ? Number(form.priceMin) : null,
        price_max: form.priceMax ? Number(form.priceMax) : null,
        technician_id: form.technicianId,
      })
      .eq('id', selectedOrder.id)

    setSaving(false)

    if (orderError) {
      setModalError('خطأ: ' + orderError.message)
      return
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id
          ? {
              ...o,
              device_model: form.deviceModel.trim(),
              issue_description: form.issueDescription.trim(),
              price_min: form.priceMin ? Number(form.priceMin) : null,
              price_max: form.priceMax ? Number(form.priceMax) : null,
              technician_id: form.technicianId,
              clients: { full_name: form.clientName.trim(), phone: form.clientPhone.trim() },
            }
          : o
      )
    )
    closeModal()
  }

  async function handleConfirmPrice() {
    setConfirming(true)
    setModalError(null)

    const { error } = await supabase
      .from('repair_orders')
      .update({ price_confirmed: true })
      .eq('id', selectedOrder.id)

    setConfirming(false)

    if (error) {
      setModalError('خطأ في تأكيد السعر: ' + error.message)
      return
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === selectedOrder.id ? { ...o, price_confirmed: true } : o))
    )
    setSelectedOrder((prev) => ({ ...prev, price_confirmed: true }))
  }

  // Comptoir changes the status (ready / delivered / cancelled ...).
  // The technician still does diagnosis + repair + final price.
  async function handleChangeStatus(newStatus) {
    if (newStatus === selectedOrder.status) return
    setModalError(null)

    if (newStatus === 'delivered' && (!selectedOrder.final_price || !selectedOrder.price_confirmed)) {
      setModalError('ما نجمش نسلم: لازم التقني يحدد السعر النهائي وتأكده (تأكيد السعر) قبل التسليم')
      return
    }
    if (newStatus === 'delivered' && !window.confirm('تأكيد تسليم الجهاز للحريف؟ (ما تنجمش ترجع فيها)')) return
    if (newStatus === 'cancelled' && !window.confirm('تأكيد إلغاء الطلب؟')) return

    setChangingStatus(true)
    const updates = { status: newStatus }
    if (newStatus === 'ready') updates.ready_at = new Date().toISOString()
    if (newStatus === 'delivered') {
      updates.delivered_at = new Date().toISOString()
      updates.delivered_by = user.id
    }
    const { error } = await supabase.from('repair_orders').update(updates).eq('id', selectedOrder.id)
    setChangingStatus(false)

    if (error) {
      setModalError('خطأ في تغيير الحالة: ' + error.message)
      return
    }
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o)))
    setSelectedOrder((prev) => ({ ...prev, status: newStatus }))
  }

  // called by UnpaidDeliveryButton after the debt was recorded (order is now delivered)
  async function handleUnpaidDone() {
    await loadOrders()
    closeModal()
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">لوحة الاستقبال</h1>
          <p className="text-sm text-[#6b6b6b]">كل عمليات الصيانة الحالية والسابقة</p>
        </div>
        <Link to="/comptoir/new-order">
          <button className="w-full sm:w-auto bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90">
            + استقبال جهاز جديد
          </button>
        </Link>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">ما فماش طلبات بعد</p>
        </div>
      ) : (
        <>
          {/* Phone / tablet: one card per order, no sideways scrolling */}
          <div className="lg:hidden flex flex-col gap-3">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => openModal(o)}
                className="text-right bg-white border border-[#e5e5e5] rounded-xl p-4 hover:bg-[#fbfaf6]"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <span className="font-bold text-[#b3170f] text-sm" dir="ltr">
                    {o.order_number}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <p className="font-semibold text-[#1a1a1a] text-sm">{o.clients?.full_name}</p>
                <p className="text-xs text-[#6b6b6b]">{o.clients?.phone}</p>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#f0f0ea]">
                  <span className="text-xs text-[#6b6b6b]">{o.device_model}</span>
                  {o.final_price ? (
                    <span className={`text-xs font-semibold ${o.price_confirmed ? 'text-green-700' : 'text-[#b3170f]'}`}>
                      {o.final_price} د.ت {!o.price_confirmed && '(غير مؤكد)'}
                    </span>
                  ) : (
                    <span className="text-xs text-[#6b6b6b]">لا يوجد سعر بعد</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: the original table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">رقم الطلب</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الحريف</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الجهاز</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الحالة</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">السعر</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => openModal(o)} className="hover:bg-[#fbfaf6] cursor-pointer">
                    <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold text-[#b3170f]" dir="ltr" style={{ textAlign: 'right' }}>
                      {o.order_number}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      {o.clients?.full_name}
                      <div className="text-xs text-[#6b6b6b]">{o.clients?.phone}</div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">{o.device_model}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      {o.final_price ? (
                        <span className={o.price_confirmed ? 'text-green-700' : 'text-[#b3170f] font-semibold'}>
                          {o.final_price} د.ت {!o.price_confirmed && '(غير مؤكد)'}
                        </span>
                      ) : (
                        <span className="text-xs text-[#6b6b6b]">لا يوجد بعد</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                      {new Date(o.created_at).toLocaleDateString('fr-TN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedOrder && form && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={closeModal}>
          <div
            className="bg-white rounded-t-xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-[#e5e5e5]">
              <div>
                <h3 className="font-bold text-[#1a1a1a]">{selectedOrder.order_number}</h3>
              </div>
              <StatusBadge status={selectedOrder.status} />
            </div>

            <div className="mb-4 bg-[#faf9f5] rounded-lg p-3">
              <label className="block text-xs font-bold text-[#e4211b] mb-1.5">تغيير حالة الطلب</label>
              {selectedOrder.status === 'delivered' || selectedOrder.status === 'cancelled' ? (
                <p className="text-xs text-[#6b6b6b]">الطلب مقفول ({selectedOrder.status === 'delivered' ? 'تم التسليم' : 'ملغى'}) — ما تنجمش تبدّل الحالة.</p>
              ) : (
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleChangeStatus(e.target.value)}
                  disabled={changingStatus}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm bg-white disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>

            <h4 className="text-xs font-bold text-[#e4211b] mb-3">معلومات الحريف</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">اسم الحريف</label>
                <input
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">رقم الهاتف</label>
                <input
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
                  dir="ltr"
                />
              </div>
            </div>

            <h4 className="text-xs font-bold text-[#e4211b] mb-3">معلومات الجهاز</h4>
            <div className="mb-3">
              <label className="block text-xs text-[#6b6b6b] mb-1">موديل الجهاز</label>
              <input
                value={form.deviceModel}
                onChange={(e) => setForm({ ...form, deviceModel: e.target.value })}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-[#6b6b6b] mb-1">وصف العطل</label>
              <textarea
                value={form.issueDescription}
                onChange={(e) => setForm({ ...form, issueDescription: e.target.value })}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">من (د.ت)</label>
                <input
                  type="number"
                  value={form.priceMin}
                  onChange={(e) => setForm({ ...form, priceMin: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#6b6b6b] mb-1">إلى (د.ت)</label>
                <input
                  type="number"
                  value={form.priceMax}
                  onChange={(e) => setForm({ ...form, priceMax: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-[#6b6b6b] mb-1">التقني المسنّد</label>
              <select
                value={form.technicianId}
                onChange={(e) => setForm({ ...form, technicianId: e.target.value })}
                className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm"
              >
                <option value="">-- اختار تقني --</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>

            {modalError && <p className="text-[#b3170f] text-sm mb-3">{modalError}</p>}

            <button
              onClick={handleSaveEdits}
              disabled={saving}
              className="w-full bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60 mb-4"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>

            <div className="pt-4 border-t border-[#e5e5e5]">
              <h4 className="text-xs font-bold text-[#e4211b] mb-2">السعر النهائي (من التقني)</h4>
              {selectedOrder.final_price ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#faf9f5] rounded-lg p-3">
                  <div>
                    <span className="font-bold text-[#1a1a1a]">{selectedOrder.final_price} د.ت</span>
                    <span className={`text-xs mr-2 ${selectedOrder.price_confirmed ? 'text-green-700' : 'text-[#b3170f]'}`}>
                      {selectedOrder.price_confirmed ? '✔ مؤكد' : '● غير مؤكد بعد'}
                    </span>
                  </div>
                  {!selectedOrder.price_confirmed && (
                    <button
                      onClick={handleConfirmPrice}
                      disabled={confirming}
                      className="w-full sm:w-auto bg-green-700 text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-60"
                    >
                      {confirming ? '...' : 'تأكيد السعر'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#6b6b6b]">التقني ما حددش السعر النهائي بعد.</p>
              )}

              {/* Customer leaves without paying everything (only shows after the price is confirmed) */}
              {selectedOrder.status !== 'cancelled' && (
                <UnpaidDeliveryButton order={selectedOrder} onDone={handleUnpaidDone} />
              )}
            </div>

            <button
              type="button"
              onClick={closeModal}
              className="w-full border border-[#e5e5e5] text-[#1a1a1a] text-sm px-4 py-2.5 rounded-lg hover:bg-[#f7f7f7] mt-4"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}