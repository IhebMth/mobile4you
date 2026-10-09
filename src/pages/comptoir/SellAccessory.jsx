import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import LowStockAlert from '../shared/LowStockAlert'
import ColorDot from '../shared/ColorDot'
import PhoneInfo from '../shared/PhoneInfo'
import { phoneOf } from '../../lib/phoneDetails'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'card', label: 'بطاقة' },
]

export default function SellAccessory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all') // all | accessory | phone

  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { load() }, [])

  // Scanned a stock label (/p/<id> -> /comptoir/sell?item=<id>): open the sale dialog for that product
  useEffect(() => {
    const id = searchParams.get('item')
    if (!id || loading) return
    const found = items.find((a) => a.id === id)
    if (found) openSell(found)
    else setError('هذا المنتج نفد من المخزون أو ما عادش موجود')
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('accessories')
      .select('id, category, name, color, image_url, sale_price, stock_quantity, phone_details(imei, condition, battery_health, internal_warranty_days)')
      .eq('is_deleted', false)
      .gt('stock_quantity', 0)
      .order('name', { ascending: true })
    if (e) setError(e.message)
    setItems(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((a) => {
      const matchesTab = tab === 'all' || a.category === tab
      const matchesText = !q || a.name.toLowerCase().includes(q) || (a.color || '').toLowerCase().includes(q) || (phoneOf(a)?.imei || '').toLowerCase().includes(q)
      return matchesTab && matchesText
    })
  }, [items, search, tab])

  function openSell(item) {
    setSelected(item)
    setQuantity(1)
    setPaymentMethod('cash')
    setClientQuery('')
    setClientResults([])
    setSelectedClient(null)
    setSaveError(null)
  }

  function closeSell() {
    setSelected(null)
  }

  // search existing clients by phone or name as the comptoir types — same idea
  // as the order form's client lookup, kept local to this page to not depend on it.
  async function searchClients(q) {
    setClientQuery(q)
    setSelectedClient(null)
    if (q.trim().length < 2) { setClientResults([]); return }
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, phone')
      .or(`phone.ilike.%${q.trim()}%,full_name.ilike.%${q.trim()}%`)
      .limit(5)
    setClientResults(data || [])
  }

  async function confirmSale() {
    setSaveError(null)
    if (!selected) return
    if (quantity < 1 || quantity > selected.stock_quantity) {
      setSaveError(`الكمية لازم تكون بين 1 و ${selected.stock_quantity}`)
      return
    }
    setSaving(true)
    const { error: err } = await supabase.rpc('sell_accessory', {
      p_accessory_id: selected.id,
      p_quantity: Number(quantity),
      p_client_id: selectedClient?.id || null,
      p_payment_method: paymentMethod,
    })
    setSaving(false)
    if (err) { setSaveError('خطأ: ' + err.message); return }
    setSuccessMsg(`تم بيع "${selected.name}" × ${quantity} — ${(selected.sale_price * quantity).toFixed(2)} د.ت`)
    setTimeout(() => setSuccessMsg(null), 4000)
    closeSell()
    load()
  }

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">بيع إكسسوار</h1>
        <p className="text-sm text-[#6b6b6b]">بيع مباشر — يسجّل في الصندوق تلقائيًا وينقص من المخزون</p>
      </div>

      <LowStockAlert />

      {successMsg && (
        <p className="bg-[#eefaf1] text-[#1f8a4c] text-sm font-semibold rounded-lg px-4 py-3 mb-4">✔ {successMsg}</p>
      )}
      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="فتّش بالاسم أو اللون أو IMEI" className={inp + ' flex-1'} />
        <div className="flex gap-2">
          {[['all', 'الكل'], ['accessory', 'إكسسوارات'], ['phone', 'هواتف']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`text-sm px-4 py-2 rounded-lg border whitespace-nowrap ${tab === v ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#6b6b6b]">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">ما فماش منتجات متوفرة حاليًا</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((a) => (
            <button key={a.id} onClick={() => openSell(a)}
              className="text-right bg-white border border-[#e5e5e5] rounded-xl p-3 hover:border-[#e4211b] transition-colors">
              {a.image_url ? (
                <img src={a.image_url} alt="" className="w-full h-24 object-cover rounded-lg mb-2" />
              ) : (
                <div className="w-full h-24 rounded-lg bg-[#faf9f5] flex items-center justify-center text-2xl mb-2">
                  {a.category === 'phone' ? '📱' : '🛍️'}
                </div>
              )}
              <p className="text-xs font-semibold text-[#1a1a1a] line-clamp-2">{a.name}</p>
              <ColorDot label={a.color} className="mt-0.5 !text-[11px]" />
              <PhoneInfo item={a} className="mt-1" />
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[10px] text-[#6b6b6b]">متوفر: {a.stock_quantity}</span>
                <span className="text-xs font-bold text-[#1f8a4c]">{Number(a.sale_price).toFixed(2)} د.ت</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={closeSell}>
          <div className="bg-white rounded-t-xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-[#1a1a1a] mb-1">{selected.name}</h3>
            <ColorDot label={selected.color} className="mb-1" />
            <PhoneInfo item={selected} full className="mb-3" />
            <p className="text-sm text-[#6b6b6b] mb-4">{Number(selected.sale_price).toFixed(2)} د.ت / واحدة — متوفر {selected.stock_quantity}</p>

            {selected.category === 'accessory' && (
              <>
                <label className="block text-sm font-semibold mb-1.5">الكمية</label>
                <input type="number" min="1" max={selected.stock_quantity} value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))} className={inp + ' mb-4'} />
              </>
            )}

            <label className="block text-sm font-semibold mb-1.5">الحريف (اختياري)</label>
            {selectedClient ? (
              <div className="flex justify-between items-center bg-[#faf9f5] rounded-lg px-3 py-2.5 mb-4">
                <span className="text-sm">{selectedClient.full_name} — {selectedClient.phone}</span>
                <button onClick={() => { setSelectedClient(null); setClientQuery('') }} className="text-xs text-[#b3170f]">إزالة</button>
              </div>
            ) : (
              <div className="relative mb-4">
                <input value={clientQuery} onChange={(e) => searchClients(e.target.value)}
                  placeholder="فتّش بالاسم أو الهاتف، أو اتركه فارغ لبيع بدون حريف" className={inp} />
                {clientResults.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-[#e5e5e5] rounded-lg mt-1 overflow-hidden shadow-sm">
                    {clientResults.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setClientResults([]) }}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-[#faf9f5]">
                        {c.full_name} — {c.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="block text-sm font-semibold mb-1.5">طريقة الدفع</label>
            <div className="flex gap-2 mb-4">
              {PAYMENT_METHODS.map((p) => (
                <button key={p.value} onClick={() => setPaymentMethod(p.value)}
                  className={`flex-1 text-sm px-4 py-2.5 rounded-lg border ${paymentMethod === p.value ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5]'}`}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="bg-[#faf9f5] rounded-lg p-3 mb-4 flex justify-between items-center">
              <span className="text-sm text-[#6b6b6b]">المجموع</span>
              <span className="font-bold text-[#1f8a4c]">{(selected.sale_price * quantity).toFixed(2)} د.ت</span>
            </div>

            {saveError && <p className="text-[#b3170f] text-sm mb-3">{saveError}</p>}
            <button onClick={confirmSale} disabled={saving}
              className="w-full bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60 mb-2">
              {saving ? '...' : 'تأكيد البيع'}
            </button>
            <button onClick={closeSell} className="w-full border border-[#e5e5e5] text-sm px-4 py-2.5 rounded-lg">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
