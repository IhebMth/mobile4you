import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'

export default function TechnicienDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadMyOrders()
  }, [user])

  async function loadMyOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('repair_orders')
      .select('id, order_number, device_model, status, issue_description, created_at')
      .eq('technician_id', user.id)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">الأجهزة المسندة إليّ</h1>
        <p className="text-sm text-[#6b6b6b]">{orders.length} جهاز قيد المعالجة</p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">ما فماش أجهزة مسندة ليك حاليًا</p>
        </div>
      ) : (
        <>
          {/* Phone / tablet: one card per order, no sideways scrolling */}
          <div className="lg:hidden flex flex-col gap-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                to={`/technicien/order/${o.id}`}
                className="block bg-white border border-[#e5e5e5] rounded-xl p-4 hover:bg-[#fbfaf6]"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <span className="font-bold text-[#b3170f] text-sm" dir="ltr">
                    {o.order_number}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <p className="font-semibold text-[#1a1a1a] text-sm">{o.device_model}</p>
                <p className="text-xs text-[#6b6b6b] mt-1 break-words">{o.issue_description}</p>
                <p className="text-[#e4211b] text-xs font-semibold mt-3">فتح التفاصيل ←</p>
              </Link>
            ))}
          </div>

          {/* Desktop: the original table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">رقم الطلب</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الجهاز</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">العطل</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الحالة</th>
                  <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#fbfaf6]">
                    <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold text-[#b3170f]" dir="ltr" style={{ textAlign: 'right' }}>
                      {o.order_number}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">{o.device_model}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                      {o.issue_description}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <Link
                        to={`/technicien/order/${o.id}`}
                        className="border border-[#e5e5e5] text-[#1a1a1a] text-xs px-3 py-1.5 rounded-lg hover:bg-[#f7f7f7]"
                      >
                        فتح التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}