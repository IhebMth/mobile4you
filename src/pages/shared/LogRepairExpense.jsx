import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

// One page for comptoir, technicien AND admin.
// Comptoir/admin can attach a part purchase to any open order;
// a technician only sees the orders assigned to them.
export default function LogRepairExpense() {
  const { user, profile } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [orderId, setOrderId] = useState('')
  const [itemName, setItemName] = useState('')
  const [supplier, setSupplier] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user && profile) {
      loadExpenses()
      loadOpenOrders()
    }
  }, [user, profile])

  async function loadExpenses() {
    setLoading(true)
    const { data } = await supabase
      .from('repair_expenses')
      .select(
        'id, item_name, supplier, purchase_price, quantity, is_approved, created_at, repair_orders(order_number, device_model)'
      )
      .eq('spent_by', user.id)
      .order('created_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  async function loadOpenOrders() {
    let query = supabase
      .from('repair_orders')
      .select('id, order_number, device_model')
      .not('status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false })

    if (profile?.role === 'technicien') {
      query = query.eq('technician_id', user.id)
    }

    const { data } = await query
    setOrders(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!orderId || !itemName.trim() || !price || Number(price) <= 0) {
      setError('اختر الطلب، وعمر اسم القطعة والسعر بشكل صحيح')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('repair_expenses').insert({
      repair_order_id: orderId,
      spent_by: user.id,
      technician_id: profile?.role === 'technicien' ? user.id : null,
      item_name: itemName.trim(),
      supplier: supplier.trim() || null,
      purchase_price: Number(price),
      quantity: Number(quantity) || 1,
    })
    setSaving(false)

    if (insertError) {
      setError('خطأ: ' + insertError.message)
      return
    }

    setOrderId('')
    setItemName('')
    setSupplier('')
    setPrice('')
    setQuantity('1')
    setShowForm(false)
    loadExpenses()
  }

  const totalPending = expenses
    .filter((e) => !e.is_approved)
    .reduce((sum, e) => sum + e.purchase_price * e.quantity, 0)

  return (
    <div>
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">مصاريف قطع الغيار</h1>
          <p className="text-sm text-[#6b6b6b]">
            {totalPending > 0
              ? `${totalPending.toFixed(2)} د.ت بانتظار اعتماد المدير`
              : 'كل مصاريفك معتمدة'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90"
        >
          {showForm ? 'إلغاء' : '+ تسجيل مصروف'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#e5e5e5] rounded-xl p-6 mb-6 max-w-xl"
        >
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">مرتبط بأي طلب صيانة</label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm"
              required
            >
              <option value="">اختر الطلب...</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {o.device_model}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">اسم القطعة</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="مثال: شاشة iPhone 12، بطارية..."
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">المورّد (اختياري)</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">الكمية</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">سعر الشراء (للوحدة)</label>
            <input
              type="number"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="بالدينار"
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              required
            />
          </div>

          {error && <p className="text-[#b3170f] text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'تسجيل'}
          </button>
        </form>
      )}

      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        ) : expenses.length === 0 ? (
          <p className="p-6 text-sm text-[#6b6b6b]">ما سجلتش أي مصروف بعد</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الطلب</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">القطعة</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الكمية</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">السعر</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-[#fbfaf6]">
                  <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                    {e.repair_orders?.order_number} — {e.repair_orders?.device_model}
                  </td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4] font-semibold">{e.item_name}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">{e.quantity}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">
                    {(e.purchase_price * e.quantity).toFixed(2)} د.ت
                  </td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">
                    {e.is_approved ? (
                      <span className="text-[#1f8a4c] text-xs font-semibold">✔ معتمد</span>
                    ) : (
                      <span className="text-[#c9750a] text-xs font-semibold">بانتظار الاعتماد</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
