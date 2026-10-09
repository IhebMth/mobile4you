import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import LowStockAlert from '../shared/LowStockAlert'
import ColorDot from '../shared/ColorDot'
import PhoneInfo from '../shared/PhoneInfo'
import LabelPrintDialog from '../../components/qr/LabelPrintDialog'
import { COLORS } from '../../lib/productColors'
import { phoneOf } from '../../lib/phoneDetails'

const MAX_IMAGE_MB = 5

function emptyForm() {
  return {
    category: 'accessory', name: '', color: '', purchase_price: '', sale_price: '',
    stock_quantity: '', low_stock_threshold: 3, supplier: '',
    // phone-only fields
    imei: '', condition: 'used', battery_health: '', internal_warranty_days: 0,
    source_type: 'supplier', source_details: '',
  }
}

// ---- nicer file picker (replaces the browser's raw "Choisir un fichier" input) ----
function ImagePicker({ file, existingUrl, onPick, onRemove }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview || existingUrl
  return (
    <div className="flex items-center gap-3 border border-dashed border-[#d8d8d0] rounded-xl p-3 bg-[#faf9f5]">
      <div className="w-20 h-20 rounded-lg bg-white border border-[#e5e5e5] overflow-hidden flex items-center justify-center shrink-0">
        {shown ? <img src={shown} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl opacity-50" aria-hidden="true">🖼️</span>}
      </div>
      <div className="min-w-0 flex-1">
        <label className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-lg bg-white border border-[#e5e5e5] text-sm font-semibold cursor-pointer hover:border-[#e4211b] hover:text-[#e4211b] active:bg-[#fdeaea] transition-colors">
          <span aria-hidden="true">📷</span> {shown ? 'تغيير الصورة' : 'اختر أو صوّر صورة'}
          <input type="file" accept="image/*" className="sr-only"
            onChange={(e) => { onPick(e.target.files?.[0] || null); e.target.value = '' }} />
        </label>
        <p className="text-[11px] text-[#9a9a9a] mt-1.5 truncate">
          {file ? file.name : shown ? 'الصورة الحالية' : `اختياري · حتى ${MAX_IMAGE_MB} MB`}
        </p>
        {shown && (
          <button type="button" onClick={onRemove} className="text-[11px] font-semibold text-[#b3170f] mt-0.5">إزالة الصورة</button>
        )}
      </div>
    </div>
  )
}

function StockBadge({ a }) {
  const out = a.stock_quantity <= 0
  const low = !out && a.category === 'accessory' && a.low_stock_threshold != null && a.stock_quantity <= a.low_stock_threshold
  const cls = out ? 'bg-[#fdeaea] text-[#b3170f]' : low ? 'bg-[#fff4e0] text-[#b36b00]' : 'bg-[#e8f6ee] text-[#1f8a4c]'
  return (
    <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${cls}`}>
      {out ? 'نفد' : low ? `قليل · ${a.stock_quantity}` : `متوفر · ${a.stock_quantity}`}
    </span>
  )
}

function TypePill({ category }) {
  return (
    <span className="text-[11px] font-semibold text-[#6b6b6b] bg-[#f3f1ea] rounded-full px-2 py-0.5 whitespace-nowrap">
      {category === 'phone' ? '📱 هاتف' : '🛍️ إكسسوار'}
    </span>
  )
}

function Thumb({ a, size = 'w-16 h-16' }) {
  return a.image_url ? (
    <img src={a.image_url} alt="" className={`${size} rounded-xl object-cover shrink-0 border border-[#e5e5e5]`} />
  ) : (
    <div className={`${size} rounded-xl bg-[#f3f1ea] shrink-0 flex items-center justify-center text-xl`} aria-hidden="true">
      {a.category === 'phone' ? '📱' : '🛍️'}
    </div>
  )
}

// ✏️ edit + 🏷️ label (QR sticker for this product)
function RowActions({ onEdit, onLabel }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onLabel} aria-label="طباعة ملصق QR"
        className="inline-flex items-center justify-center min-h-[36px] w-10 rounded-lg border border-[#e5e5e5] bg-white text-sm hover:border-[#e4211b] active:bg-[#fdeaea] transition-colors">🏷️</button>
      <EditButton onClick={onEdit} />
    </div>
  )
}

function EditButton({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[#e5e5e5] bg-white text-xs font-semibold text-[#1a1a1a] hover:border-[#e4211b] hover:text-[#e4211b] active:bg-[#fdeaea] transition-colors">
      <span aria-hidden="true">✏️</span> تعديل
    </button>
  )
}

export default function AccessoriesManagement() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all') // all | accessory | phone

  // The sheet is saved in sessionStorage while it is open: if the phone browser reloads the page
  // (coming back from the camera / gallery, switching app, Vite dev server reconnecting), the sheet
  // and everything typed in it come back instead of vanishing.
  const DRAFT_KEY = 'm4u-stock-draft'
  const draft = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } })()
  const [showForm, setShowForm] = useState(!!draft)
  const [editingId, setEditingId] = useState(draft ? draft.editingId : null)
  const [form, setForm] = useState(draft ? { ...emptyForm(), ...draft.form } : emptyForm())
  const [imageFile, setImageFile] = useState(null)
  const [existingImageUrl, setExistingImageUrl] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [labelItem, setLabelItem] = useState(null) // product whose QR label is being printed
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { load() }, [])

  // Scanned a stock label (/p/<id> -> /admin/accessories?item=<id>): open that product's edit sheet
  useEffect(() => {
    const id = searchParams.get('item')
    if (!id || loading) return
    const found = items.find((a) => a.id === id)
    if (found) openEdit(found)
    else setError('هذا المنتج غير موجود أو تم حذفه')
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  useEffect(() => {
    try {
      if (showForm) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ editingId, form }))
      else sessionStorage.removeItem(DRAFT_KEY)
    } catch { /* storage full or blocked: ignore */ }
  }, [showForm, editingId, form])

  useEffect(() => {
    if (!showForm) return
    const onKey = (e) => { if (e.key === 'Escape' && !saving) setShowForm(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, saving])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('accessories')
      .select('id, category, name, color, image_url, purchase_price, sale_price, stock_quantity, sold_quantity, low_stock_threshold, supplier, is_deleted, phone_details(imei, condition, battery_health, internal_warranty_days, source_type, source_details)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    setItems(data || [])
    setLoading(false)
  }

  const counts = useMemo(() => ({
    all: items.length,
    accessory: items.filter((a) => a.category === 'accessory').length,
    phone: items.filter((a) => a.category === 'phone').length,
  }), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((a) => {
      const matchesTab = tab === 'all' || a.category === tab
      const matchesText = !q
        || a.name.toLowerCase().includes(q)
        || (a.color || '').toLowerCase().includes(q)
        || (phoneOf(a)?.imei || '').toLowerCase().includes(q)
      return matchesTab && matchesText
    })
  }, [items, search, tab])

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setImageFile(null); setExistingImageUrl(null); setRemoveImage(false)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(a) {
    const pd = phoneOf(a)
    setEditingId(a.id)
    setForm({
      category: a.category, name: a.name, color: a.color || '',
      purchase_price: a.purchase_price, sale_price: a.sale_price,
      stock_quantity: a.stock_quantity, low_stock_threshold: a.low_stock_threshold ?? 3,
      supplier: a.supplier || '',
      imei: pd?.imei || '', condition: pd?.condition || 'used',
      battery_health: pd?.battery_health ?? '', internal_warranty_days: pd?.internal_warranty_days ?? 0,
      source_type: pd?.source_type || 'supplier', source_details: pd?.source_details || '',
    })
    setImageFile(null); setExistingImageUrl(a.image_url); setRemoveImage(false)
    setFormError(null)
    setShowForm(true)
  }

  function pickImage(file) {
    if (!file) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFormError(`الصورة كبيرة برشا (الحد ${MAX_IMAGE_MB} MB)`)
      return
    }
    setFormError(null)
    setImageFile(file)
    setRemoveImage(false)
  }

  async function uploadImageIfAny() {
    if (removeImage && !imageFile) return null
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
        color: form.color.trim() || null,
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
    setShowForm(false)
    load()
  }

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm bg-white focus:outline-none focus:border-[#e4211b] focus:ring-2 focus:ring-[#e4211b]/10'
  const lbl = 'block text-sm font-semibold mb-1.5'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">المخزون</h1>
          <p className="text-sm text-[#6b6b6b]">
            إكسسوارات وهواتف للبيع المباشر
            {counts.all > 0 && <span className="text-[#9a9a9a]"> · {counts.all} منتج</span>}
          </p>
        </div>
        <button onClick={openAdd}
          className="w-full sm:w-auto bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-sm active:scale-[0.98] transition">
          + إضافة منتج
        </button>
      </div>

      <LowStockAlert />

      {/* search + tabs */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="relative">
          <span className="absolute top-1/2 -translate-y-1/2 right-3.5 text-[#9a9a9a] pointer-events-none" aria-hidden="true">🔎</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="فتّش بالاسم أو اللون أو IMEI" className={inp + ' pr-10 pl-10'} />
          {search && (
            <button onClick={() => setSearch('')} aria-label="مسح البحث"
              className="absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]">✕</button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 bg-[#f3f1ea] rounded-xl p-1 sm:max-w-md">
          {[['all', 'الكل'], ['accessory', '🛍️ إكسسوارات'], ['phone', '📱 هواتف']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`text-xs sm:text-sm font-semibold py-2 rounded-lg transition-colors ${tab === v ? 'bg-white text-[#e4211b] shadow-sm' : 'text-[#6b6b6b]'}`}>
              {l} <span className="opacity-60">· {counts[v]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {/* list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-[#f3f1ea] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-[#d8d8d0] rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm text-[#6b6b6b]">{items.length === 0 ? 'ما فماش منتجات بعد.' : 'ما فماش نتائج لهذا البحث.'}</p>
        </div>
      ) : (
        <>
          {/* phone + tablet: cards */}
          <div className="lg:hidden flex flex-col gap-3">
            {filtered.map((a) => (
              <div key={a.id} className="bg-white border border-[#e5e5e5] rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex gap-3">
                  <Thumb a={a} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#1a1a1a] text-sm break-words">{a.name}</p>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                      <TypePill category={a.category} />
                      <ColorDot label={a.color} />
                    </div>
                    {phoneOf(a)?.imei && (
                      <p className="text-[11px] text-[#9a9a9a] mt-1" dir="ltr">IMEI: {phoneOf(a).imei}</p>
                    )}
                    <PhoneInfo item={a} full className="mt-1.5" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#f0f0ea]">
                  <div className="flex items-center gap-2">
                    <StockBadge a={a} />
                    <span className="font-extrabold text-[#1f8a4c] text-sm bg-[#e8f6ee] rounded-lg px-2.5 py-1 whitespace-nowrap">
                      {Number(a.sale_price).toFixed(2)} د.ت
                    </span>
                  </div>
                  <RowActions onEdit={() => openEdit(a)} onLabel={() => setLabelItem(a)} />
                </div>
              </div>
            ))}
          </div>

          {/* desktop: table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea]">
                      <div className="flex items-center gap-3">
                        <Thumb a={a} size="w-11 h-11" />
                        <div className="min-w-0">
                          <p className="font-bold">{a.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <ColorDot label={a.color} />
                            {phoneOf(a)?.imei && (
                              <span className="text-[11px] text-[#9a9a9a]" dir="ltr">IMEI: {phoneOf(a).imei}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea]"><TypePill category={a.category} /></td>
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea]"><StockBadge a={a} /></td>
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea] font-extrabold text-[#1f8a4c]">{Number(a.sale_price).toFixed(2)} د.ت</td>
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea] text-xs text-[#6b6b6b]">{a.supplier || '—'}</td>
                    <td className="px-5 py-3.5 border-b border-[#f0f0ea] text-left"><RowActions onEdit={() => openEdit(a)} onLabel={() => setLabelItem(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {labelItem && <LabelPrintDialog item={labelItem} onClose={() => setLabelItem(null)} />}

      {/* add / edit — bottom sheet on phone, centered dialog on desktop */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          {/* No tap-outside-to-close here on purpose: this form can hold a lot of typed
              input (IMEI, prices...), and an accidental tap on the dark overlay while
              scrolling on a phone used to wipe it all out. Close only via the ✕ or إلغاء. */}
          <form onSubmit={submitForm}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}
            className="bg-white w-full sm:max-w-lg max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl">
            {/* sticky title */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] shrink-0">
              <h3 className="font-extrabold text-base">{editingId ? '✏️ تعديل المنتج' : 'منتج جديد'}</h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="إغلاق"
                className="w-8 h-8 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]">✕</button>
            </div>

            {/* scrolling body */}
            <div className="overflow-y-auto px-5 py-4">
              {!editingId && (
                <>
                  <label className={lbl}>إكسسوار ولا هاتف؟</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {[['accessory', '🛍️ إكسسوار'], ['phone', '📱 هاتف']].map(([v, l]) => (
                      <button type="button" key={v} onClick={() => setForm({ ...form, category: v })}
                        className={`text-sm font-semibold py-2.5 rounded-lg border transition-colors ${form.category === v ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label className={lbl}>الاسم</label>
              <input className={inp + ' mb-4'}
                placeholder={form.category === 'phone' ? 'مثلاً: iPhone 13 128GB' : 'مثلاً: غلاف سيليكون شفاف'}
                value={form.name} onChange={set('name')} />

              {/* color */}
              <label className={lbl}>اللون (اختياري)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COLORS.map(([n, hex]) => (
                  <button type="button" key={n} onClick={() => setForm({ ...form, color: form.color === n ? '' : n })}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 min-h-[36px] rounded-full border transition-colors ${form.color === n ? 'border-[#e4211b] bg-[#fdeaea] text-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b] hover:border-[#bdbdb5]'}`}>
                    <span className="w-4 h-4 rounded-full border border-black/15" style={{ background: hex }} aria-hidden="true" />
                    {n}
                  </button>
                ))}
              </div>
              <input className={inp + ' mb-4'} placeholder="أو اكتب لون آخر (مثلاً: أزرق ليلي)"
                value={form.color} onChange={set('color')} />

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className={lbl}>سعر الشراء (د.ت)</label>
                  <input type="number" step="0.001" inputMode="decimal" className={inp}
                    value={form.purchase_price} onChange={set('purchase_price')} />
                </div>
                <div>
                  <label className={lbl}>سعر البيع (د.ت)</label>
                  <input type="number" step="0.001" inputMode="decimal" className={inp}
                    value={form.sale_price} onChange={set('sale_price')} />
                </div>
              </div>

              {form.category === 'accessory' ? (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={lbl}>الكمية بالمخزون</label>
                    <input type="number" inputMode="numeric" className={inp}
                      value={form.stock_quantity} onChange={set('stock_quantity')} />
                  </div>
                  <div>
                    <label className={lbl}>تنبيه عند (حد أدنى)</label>
                    <input type="number" inputMode="numeric" className={inp}
                      value={form.low_stock_threshold} onChange={set('low_stock_threshold')} />
                  </div>
                </div>
              ) : (
                <div className="bg-[#faf9f5] border border-[#eeece4] rounded-xl p-3.5 mb-4">
                  <p className="text-xs text-[#6b6b6b] mb-3">📱 الهاتف قطعة وحدة — الكمية دائمًا 1 (IMEI مميز)</p>
                  <label className={lbl}>IMEI</label>
                  <input className={inp + ' mb-3'} dir="ltr" inputMode="numeric" value={form.imei} onChange={set('imei')} />
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">الحالة</label>
                      <select className={inp} value={form.condition} onChange={set('condition')}>
                        <option value="new">جديد</option>
                        <option value="used">مستعمل</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">حالة البطارية %</label>
                      <input type="number" min="0" max="100" inputMode="numeric" className={inp}
                        value={form.battery_health} onChange={set('battery_health')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">ضمان داخلي (أيام)</label>
                      <input type="number" inputMode="numeric" className={inp}
                        value={form.internal_warranty_days} onChange={set('internal_warranty_days')} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#6b6b6b] mb-1">المصدر</label>
                      <select className={inp} value={form.source_type} onChange={set('source_type')}>
                        <option value="supplier">مورّد</option>
                        <option value="client_trade_in">شراء من حريف</option>
                      </select>
                    </div>
                  </div>
                  <label className="block text-xs text-[#6b6b6b] mb-1">تفاصيل إضافية عن المصدر (اختياري)</label>
                  <input className={inp} value={form.source_details} onChange={set('source_details')} />
                </div>
              )}

              <label className={lbl}>المورّد (اختياري)</label>
              <input className={inp + ' mb-4'} value={form.supplier} onChange={set('supplier')} />

              <label className={lbl}>صورة المنتج (اختياري)</label>
              <ImagePicker
                file={imageFile}
                existingUrl={removeImage ? null : existingImageUrl}
                onPick={pickImage}
                onRemove={() => { setImageFile(null); setRemoveImage(true) }}
              />
            </div>

            {/* sticky footer: always reachable, even on a small phone */}
            <div className="shrink-0 border-t border-[#e5e5e5] px-5 py-3 bg-white rounded-b-2xl">
              {formError && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-3 py-2 mb-3">{formError}</p>}
              <div className="flex items-center gap-2">
                <button disabled={saving}
                  className="flex-1 bg-[#e4211b] text-white font-semibold text-sm px-5 py-3 rounded-lg disabled:opacity-60">
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving}
                  className="px-5 py-3 text-sm font-semibold rounded-lg border border-[#e5e5e5] text-[#6b6b6b]">
                  إلغاء
                </button>
                {editingId && (
                  <button type="button" onClick={() => softDelete(editingId)}
                    className="px-3 py-3 text-sm font-semibold rounded-lg text-[#b3170f] hover:bg-[#fdeaea]" aria-label="حذف المنتج">
                    🗑
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
