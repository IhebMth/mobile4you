import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

// Shows a small warning banner for accessories running low on stock.
// Phones are excluded on purpose: each phone is a single unique unit (IMEI),
// so "low stock" has no meaning for them — they're either in stock (1) or sold (0).
export default function LowStockAlert() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('accessories')
      .select('id, name, stock_quantity, low_stock_threshold')
      .eq('category', 'accessory')
      .eq('is_deleted', false)
      .order('stock_quantity', { ascending: true })
    setItems((data || []).filter((a) => a.stock_quantity <= (a.low_stock_threshold ?? 3)))
    setLoading(false)
  }

  if (loading || items.length === 0) return null

  return (
    <div className="bg-[#fff8f0] border border-[#f0d9b8] rounded-xl p-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#8a4f06]">⚠ مخزون منخفض ({items.length})</p>
          <ul className="text-xs text-[#8a4f06] mt-1.5 space-y-0.5">
            {items.slice(0, 5).map((a) => (
              <li key={a.id}>
                {a.name} — باقي {a.stock_quantity} {a.stock_quantity === 0 && '(نفذ تمامًا)'}
              </li>
            ))}
            {items.length > 5 && <li>و {items.length - 5} منتجات أخرى...</li>}
          </ul>
        </div>
        <Link to="/admin/accessories" className="shrink-0 text-xs font-semibold text-[#8a4f06] underline whitespace-nowrap">
          إدارة المخزون
        </Link>
      </div>
    </div>
  )
}
