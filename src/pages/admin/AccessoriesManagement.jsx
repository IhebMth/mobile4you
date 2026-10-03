import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import LowStockAlert from '../shared/LowStockAlert'

function emptyForm() {
  return {
    category: 'accessory', name: '', purchase_price: '', sale_price: '',
    stock_quantity: '', low_stock_threshold: 3, supplier: '',
    // phone-only fields
    imei: '', condition: 'used', battery_health: '', internal_warranty_days: 0,
    source_type: 'supplier', source_details: '',
  }
}

export default function AccessoriesManagement() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all') // all | accessory | phone

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [imageFile, setImageFile] = useState(null)
  const [existingImageUrl, setExistingImageUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('accessories')
      .select('id, category, name, image_url, purchase_price, sale_price, stock_quantity, sold_quantity, low_stock_threshold, supplier, is_deleted, phone_details(imei, condition, battery_health, internal_warranty_days, source_type, source_details)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    setItems(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((a) => {
      const matchesTab = tab === 'all' || a.category === tab
      const matchesText = !q || a.name.toLowerCase().includes(q) || (a.phone_details?.[0]?.imei || '').toLowerCase().includes(q)
      return matchesTab && matchesText
    })
  }, [items, search, tab])

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setImageFile(null)
    setExistingImageUrl(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(a) {
    const pd = a.phone_details?.[0]
    setEditingId(a.id)
    setForm({
      category: a.category, name: a.name,
      purchase_price: a.purchase_price, sale_price: a.sale_price,
      stock_quantity: a.stock_quantity, low_stock_threshold: a.low_stock_threshold ?? 3,
      supplier: a.supplier || '',
      imei: pd?.imei || '', condition: pd?.condition || 'used',
      battery_health: pd?.battery_health ?? '', internal_warranty_days: pd?.internal_warranty_days ?? 0,
      source_type: pd?.source_type || 'supplier', source_details: pd?.source_details || '',
    })
    setImageFile(null)
    setExistingImageUrl(a.image_url)
    setFormError(null)
    setShowForm(true)
  }

  async function uploadImageIfAny() {
    if (!imageFile) return existingImageUrl
    const path = `${Date.now()}_${imageFile.name.replace(/\s+/g, '_')}`
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, imageFile)
    if (upErr) throw new Error('فشل رفع الصورة: ' + upErr.message)
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function submitForm(e) {
    e.preventDefault()
    setFormError(null)
    const isPhone = form.category === 'phone'
    if (!form.name.trim() || Number(form.sale_price) <= 0 || Number(form.purchase_price) < 0) {
      setFormError('عمر الاسم وسعر الشراء وسعر البيع')
      return
    }
    if (isPhone && !form.imei.trim()) {
      setFormError('عمر رقم IMEI للهاتف')
      return
    }
    setSaving(true)
    try {
      const image_url = await uploadImageIfAny()
      const payload = {
        category: form.category,
        name: form.name.trim(),
        purchase_price: Number(form.purchase_price),
        sale_price: Number(form.sale_price),
        stock_quantity: isPhone ? 1 : Number(form.stock_quantity || 0),
        low_stock_threshold: isPhone ? null : Number(form.low_stock_threshold || 3),
        supplier: form.supplier.trim() || null,
        image_url,
      }

      let accessoryId = editingId
      if (editingId) {
        const { error: err } = await supabase.from('accessories').update(payload).eq('id', editingId)
        if (err) throw new Error(err.message)
      } else {
        const { data, error: err } = await supabase.from('accessories').insert(payload).select('id').single()
        if (err) throw new Error(err.message)
        accessoryId = data.id
      }

      if (isPhone) {
        const { error: err } = await supabase.from('phone_details').upsert({
          accessory_id: accessoryId,
          imei: form.imei.trim(),
          condition: form.condition,
          battery_health: form.battery_health === '' ? null : Number(form.battery_health),
          internal_warranty_days: Number(form.internal_warranty_days || 0),
          source_type: form.source_type,
          source_details: form.source_details.trim() || null,
        }, { onConflict: 'accessory_id' })
        if (err) throw new Error('تم حفظ المنتج لكن خطأ في تفاصيل الهاتف: ' + err.message)
      }

      setShowForm(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function softDelete(id) {
    if (!window.confirm('حذف هذا المنتج؟ (يختفي من القوائم لكن يبقى في سجل المبيعات القديمة)')) return
    const { error: err } = await supabase.from('accessories').update({ is_deleted: true }).eq('id', id)
    if (err) { alert('ما نجحش: ' + err.message); return }
    load()
  }

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">المخزون</h1>
          <p className="text-sm text-[#6b6b6b]">إكسسوارات وهواتف للبيع المباشر</p>
        </div>
        <button onClick={showForm ? () => setShowForm(false) : openAdd}
          className="w-full sm:w-auto bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg">
          {showForm ? 'إلغاء' : '+ إضافة منتج'}
        </button>
      </div>

      <LowStockAlert />

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="فتّش بالاسم أو IMEI" className={inp + ' flex-1'} />
        <div className="flex gap-2">
          {[['all', 'الكل'], ['accessory', 'إكسسوارات'], ['phone', 'هواتف']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`text-sm px-4 py-2 rounded-lg border whitespace-nowrap ${tab === v ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={submitForm} className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-6 mb-6 max-w-lg">
          <h3 className="font-bold text-sm mb-4">{editingId ? 'تعديل المنتج' : 'منتج جديد'}</h3>

          {!editingId && (
            <>
              <label className="block text-sm font-semibold mb-1.5">إكسسوار ولا هاتف؟</label>
              <div className="flex gap-2 mb-4">
                {[['accessory', 'إكسسوار'], ['phone', 'هاتف']].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setForm({ ...form, category: v })}
                    className={`flex-1 text-sm px-4 py-2.5 rounded-lg border ${form.category === v ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5]'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="block text-sm font-semibold mb-1.5">الاسم</label>
          <input className={inp + ' mb-4'} placeholder={form.category === 'phone' ? 'مثلاً: iPhone 13 128GB أسود' : 'مثلاً: غلاف سيليكون شفاف'}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">سعر الشراء (د.ت)</label>
              <input type="number" step="0.001" className={inp}
                value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">سعر البيع (د.ت)</label>
              <input type="number" step="0.001" className={inp}
                value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            </div>
          </div>

          {form.category === 'accessory' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5">الكمية بالمخزون</label>
                <input type="number" className={inp}
                  value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">تنبيه عند (حد أدنى)</label>
                <input type="number" className={inp}
                  value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              </div>
            </div>
          ) : (
            <>
              <div className="bg-[#faf9f5] rounded-lg p-3 mb-4">
                <p className="text-xs text-[#6b6b6b] mb-3">الهاتف قطعة وحدة — الكمية دائمًا 1 (IMEI مميز)</p>
                <label className="block text-sm font-semibold mb-1.5">IMEI</label>
                <input className={inp + ' mb-3'} dir="ltr"
                  value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">الحالة</label>
                    <select className={inp} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                      <option value="new">جديد</option>
                      <option value="used">مستعمل</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">حالة البطارية %</label>
                    <input type="number" min="0" max="100" className={inp}
                      value={form.battery_health} onChange={(e) => setForm({ ...form, battery_health: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">ضمان داخلي (أيام)</label>
                    <input type="number" className={inp}
                      value={form.internal_warranty_days} onChange={(e) => setForm({ ...form, internal_warranty_days: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] mb-1">المصدر</label>
                    <select className={inp} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                      <option value="supplier">مورّد</option>
                      <option value="client_trade_in">شراء من حريف</option>
                    </select>
                  </div>
                </div>
                <label className="block text-xs text-[#6b6b6b] mb-1">تفاصيل إضافية عن المصدر (اختياري)</label>
                <input className={inp}
                  value={form.source_details} onChange={(e) => setForm({ ...form, source_details: e.target.value })} />
              </div>
            </>
          )}

          <label className="block text-sm font-semibold mb-1.5">المورّد (اختياري)</label>
          <input className={inp + ' mb-4'} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />

          <label className="block text-sm font-semibold mb-1.5">صورة المنتج (اختياري)</label>
          <input type="file" accept="image/*" className="text-sm mb-4"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          {existingImageUrl && !imageFile && (
            <img src={existingImageUrl} alt="" className="w-20 h-20 object-cover rounded-lg mb-4 border border-[#e5e5e5]" />
          )}

          {formError && <p className="text-[#b3170f] text-sm mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60">
              {saving ? '...' : 'حفظ'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { softDelete(editingId); setShowForm(false) }}
                className="text-[#b3170f] text-sm px-4 py-2.5">
                حذف
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">ما فماش منتجات</p></div>
      ) : (
        <>
          {/* phone: cards */}
          <div className="lg:hidden flex flex-col gap-3">
            {filtered.map((a) => (
              <div key={a.id} className="bg-white border border-[#e5e5e5] rounded-xl p-4 flex gap-3">
                {a.image_url ? (
                  <img src={a.image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#faf9f5] shrink-0 flex items-center justify-center text-xl">
                    {a.category === 'phone' ? '📱' : '🛍️'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#1a1a1a] text-sm">{a.name}</p>
                  {a.phone_details?.[0]?.imei && (
                    <p className="text-[10px] text-[#6b6b6b]" dir="ltr">IMEI: {a.phone_details[0].imei}</p>
                  )}
                  <div className="flex justify-between items-center mt-2">
                    <span className={`text-xs font-semibold ${a.stock_quantity <= 0 ? 'text-[#b3170f]' : 'text-[#6b6b6b]'}`}>
                      متوفر: {a.stock_quantity}
                    </span>
                    <span className="font-bold text-[#1f8a4c] text-sm">{Number(a.sale_price).toFixed(2)} د.ت</span>
                  </div>
                  <button onClick={() => openEdit(a)} className="text-[10px] text-[#6b6b6b] hover:text-[#e4211b] mt-1">تعديل</button>
                </div>
              </div>
            ))}
          </div>

          {/* desktop: table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">المنتج</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">النوع</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">المتوفر</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">سعر البيع</th>
                  <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">المورّد</th>
                  <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-[#fbfaf6]">
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <div className="flex items-center gap-3">
                        {a.image_url ? (
                          <img src={a.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#faf9f5] flex items-center justify-center">
                            {a.category === 'phone' ? '📱' : '🛍️'}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">{a.name}</p>
                          {a.phone_details?.[0]?.imei && (
                            <p className="text-[10px] text-[#6b6b6b]" dir="ltr">IMEI: {a.phone_details[0].imei}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                      {a.category === 'phone' ? 'هاتف' : 'إكسسوار'}
                    </td>
                    <td className={`px-5 py-3.5 border-b border-[#ececE4] font-semibold ${a.stock_quantity <= 0 ? 'text-[#b3170f]' : ''}`}>
                      {a.stock_quantity}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold text-[#1f8a4c]">{Number(a.sale_price).toFixed(2)} د.ت</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">{a.supplier || '—'}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <button onClick={() => openEdit(a)} className="text-xs text-[#6b6b6b] hover:text-[#e4211b]">تعديل</button>
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
