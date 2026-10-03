import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

// Common part types shown as quick filter chips + suggestions in the form.
// Free text is still allowed (e.g. "بورت شحن") — this list is just a shortcut.
const COMMON_PARTS = ['شاشة', 'بطارية', 'سماعة', 'كاميرا', 'بورت شحن', 'زجاج خلفي']
const PART_ICONS = { 'شاشة': '📱', 'بطارية': '🔋', 'سماعة': '🔊', 'كاميرا': '📷', 'بورت شحن': '🔌', 'زجاج خلفي': '🪟' }
const partIcon = (p) => PART_ICONS[p] || '🔧'

function priceLabel(r) {
  const hasMax = r.price_max != null && Number(r.price_max) !== Number(r.price_min)
  return hasMax
    ? `${Number(r.price_min).toFixed(2)} - ${Number(r.price_max).toFixed(2)} د.ت`
    : `${Number(r.price_min).toFixed(2)} د.ت`
}

function EditedBy({ r }) {
  if (!r.updated_at) return null
  return (
    <p className="text-[11px] text-[#9a9a9a] mt-1">
      آخر تعديل: {r.profiles?.full_name || '—'} · {new Date(r.updated_at).toLocaleDateString('fr-TN')}
    </p>
  )
}

// Proper, tappable edit button (replaces the old tiny 10px text link).
function EditButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[#e5e5e5] bg-white text-xs font-semibold text-[#1a1a1a] hover:border-[#e4211b] hover:text-[#e4211b] active:bg-[#fdeaea] transition-colors"
    >
      <span aria-hidden="true">✏️</span> تعديل
    </button>
  )
}

export default function PriceGuide() {
  const { user, profile } = useAuth()
  // Admin AND technicien can add / edit / delete. Comptoir can only view and search.
  const canEdit = ['admin', 'super_admin', 'technicien'].includes(profile?.role)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [partFilter, setPartFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  function emptyForm() {
    return { device_model: '', part_type: '', quality_label: '', price_min: '', price_max: '', notes: '' }
  }

  useEffect(() => { load() }, [])

  // Esc closes the edit sheet
  useEffect(() => {
    if (!showForm) return
    const onKey = (e) => { if (e.key === 'Escape') setShowForm(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm])

  async function load() {
    setLoading(true)
    setError(null)
    // two foreign keys to profiles (created_by / updated_by) -> name the one we want
    const { data, error: e } = await supabase
      .from('part_price_guide')
      .select(
        'id, device_model, part_type, quality_label, price_min, price_max, notes, updated_at, ' +
        'profiles!part_price_guide_updated_by_fkey(full_name)'
      )
      .order('device_model', { ascending: true })
      .order('part_type', { ascending: true })
      .order('price_min', { ascending: true })
    if (e) setError(e.message)
    setRows(data || [])
    setLoading(false)
  }

  // Search box filters by device model OR part type OR quality label — all client-side,
  // since the whole guide is small enough to load once and filter instantly as you type.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const matchesText =
        !q ||
        r.device_model.toLowerCase().includes(q) ||
        r.part_type.toLowerCase().includes(q) ||
        r.quality_label.toLowerCase().includes(q)
      const matchesPart = !partFilter || r.part_type === partFilter
      return matchesText && matchesPart
    })
  }, [rows, search, partFilter])

  // group by device model so all rows for "iPhone 13" (screen x3, battery...) sit together
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of filtered) {
      if (!map.has(r.device_model)) map.set(r.device_model, [])
      map.get(r.device_model).push(r)
    }
    return [...map.entries()]
  }, [filtered])

  const partTypesInUse = useMemo(() => {
    const counts = new Map()
    for (const r of rows) counts.set(r.part_type, (counts.get(r.part_type) || 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [rows])

  function openAdd(prefillModel = '') {
    setEditingId(null)
    setForm({ ...emptyForm(), device_model: prefillModel })
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(r) {
    setEditingId(r.id)
    setForm({
      device_model: r.device_model, part_type: r.part_type, quality_label: r.quality_label,
      price_min: r.price_min, price_max: r.price_max ?? '', notes: r.notes || '',
    })
    setFormError(null)
    setShowForm(true)
  }

  async function submitForm(e) {
    e.preventDefault()
    setFormError(null)
    const min = Number(form.price_min)
    const max = form.price_max === '' ? null : Number(form.price_max)
    if (!form.device_model.trim() || !form.part_type.trim() || !form.quality_label.trim() || !(min > 0)) {
      setFormError('عمّر الموديل ونوع القطعة والدرجة وسعر "من" على الأقل')
      return
    }
    if (max !== null && max < min) {
      setFormError('"إلى" لازم يكون أكبر أو يساوي "من"')
      return
    }
    setSaving(true)
    const payload = {
      device_model: form.device_model.trim(),
      part_type: form.part_type.trim(),
      quality_label: form.quality_label.trim(),
      price_min: min,
      price_max: max,
      notes: form.notes.trim() || null,
    }
    const { error: err } = editingId
      ? await supabase.from('part_price_guide').update(payload).eq('id', editingId)
      : await supabase.from('part_price_guide').insert({ ...payload, created_by: user.id })
    setSaving(false)
    if (err) { setFormError('خطأ: ' + err.message); return }
    setShowForm(false)
    load()
  }

  async function remove(id) {
    if (!window.confirm('حذف هذا السعر نهائيًا؟')) return
    const { error: err } = await supabase.from('part_price_guide').delete().eq('id', id)
    if (err) { alert('ما نجحش: ' + err.message); return }
    setShowForm(false)
    load()
  }

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm bg-white focus:outline-none focus:border-[#e4211b] focus:ring-2 focus:ring-[#e4211b]/10'

  return (
    <div>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">دليل الأسعار</h1>
          <p className="text-sm text-[#6b6b6b]">
            أسعار تقديرية (من - إلى) حسب موديل الهاتف ونوع القطعة
            {rows.length > 0 && <span className="text-[#9a9a9a]"> · {rows.length} سعر</span>}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => openAdd()}
            className="w-full sm:w-auto bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-sm active:scale-[0.98] transition"
          >
            + إضافة سعر
          </button>
        )}
      </div>

      {/* search + part-type chips */}
      <div className="mb-5">
        <div className="relative mb-3">
          <span className="absolute top-1/2 -translate-y-1/2 right-3.5 text-[#9a9a9a] pointer-events-none" aria-hidden="true">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="فتّش بموديل الهاتف أو نوع القطعة (مثلاً: iPhone 13 أو شاشة)"
            className={inp + ' pr-10 pl-10'}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="مسح البحث"
              className="absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]"
            >
              ✕
            </button>
          )}
        </div>
        {partTypesInUse.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            <button
              onClick={() => setPartFilter('')}
              className={`shrink-0 text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${!partFilter ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white border-[#e5e5e5] text-[#6b6b6b]'}`}
            >
              الكل
            </button>
            {partTypesInUse.map(([p, n]) => (
              <button
                key={p}
                onClick={() => setPartFilter(p === partFilter ? '' : p)}
                className={`shrink-0 text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${partFilter === p ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'bg-white border-[#e5e5e5] text-[#6b6b6b]'}`}
              >
                {partIcon(p)} {p} <span className="opacity-60">· {n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {/* list */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-[#f3f1ea] animate-pulse" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white border border-dashed border-[#d8d8d0] rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">💲</p>
          <p className="text-sm text-[#6b6b6b]">
            {rows.length === 0 ? 'ما فماش أسعار مسجلة بعد.' : 'ما فماش نتائج لهذا البحث.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([model, items]) => (
            <div key={model} className="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="px-4 sm:px-5 py-3 bg-[#faf9f5] border-b border-[#e5e5e5] flex items-center justify-between gap-3">
                <h2 className="font-extrabold text-[#1a1a1a] text-sm truncate">{model}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-[#6b6b6b] bg-white border border-[#e5e5e5] rounded-full px-2.5 py-0.5">
                    {items.length}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => openAdd(model)}
                      className="text-[11px] font-semibold text-[#e4211b] hover:underline"
                    >
                      + قطعة لهذا الموديل
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[#f0f0ea]">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${showForm && editingId === r.id ? 'bg-[#fff8f0]' : 'hover:bg-[#fbfaf6]'}`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="w-9 h-9 shrink-0 rounded-xl bg-[#f3f1ea] flex items-center justify-center text-base" aria-hidden="true">
                        {partIcon(r.part_type)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1a1a1a]">
                          {r.part_type}
                          <span className="font-medium text-[11px] text-[#6b6b6b] bg-[#f3f1ea] rounded-full px-2 py-0.5 mr-2">
                            {r.quality_label}
                          </span>
                        </p>
                        {r.notes && <p className="text-xs text-[#6b6b6b] mt-1 break-words">{r.notes}</p>}
                        <EditedBy r={r} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span className="font-extrabold text-[#1f8a4c] text-sm bg-[#e8f6ee] rounded-lg px-3 py-1.5 whitespace-nowrap">
                        {priceLabel(r)}
                      </span>
                      {canEdit && <EditButton onClick={() => openEdit(r)} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* add / edit — bottom sheet on phone, centered dialog on desktop */}
      {canEdit && showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <form
            onSubmit={submitForm}
            className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-base">{editingId ? '✏️ تعديل السعر' : 'سعر جديد'}</h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="إغلاق"
                className="w-8 h-8 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]">✕</button>
            </div>

            <label className="block text-sm font-semibold mb-1.5">موديل الهاتف</label>
            <input className={inp + ' mb-4'} placeholder="مثلاً: iPhone 13 Pro"
              value={form.device_model} onChange={(e) => setForm({ ...form, device_model: e.target.value })} />

            <label className="block text-sm font-semibold mb-1.5">نوع القطعة</label>
            <input className={inp + ' mb-2'} placeholder="مثلاً: شاشة"
              value={form.part_type} onChange={(e) => setForm({ ...form, part_type: e.target.value })} list="part-type-options" />
            <datalist id="part-type-options">
              {COMMON_PARTS.map((p) => <option key={p} value={p} />)}
            </datalist>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {COMMON_PARTS.map((p) => (
                <button type="button" key={p} onClick={() => setForm({ ...form, part_type: p })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.part_type === p ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b] hover:border-[#e4211b] hover:text-[#e4211b]'}`}>
                  {partIcon(p)} {p}
                </button>
              ))}
            </div>

            <label className="block text-sm font-semibold mb-1.5">الدرجة / النوع (أصلي، نسخة درجة أولى...)</label>
            <input className={inp + ' mb-4'} placeholder="مثلاً: أصلي"
              value={form.quality_label} onChange={(e) => setForm({ ...form, quality_label: e.target.value })} />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5">من (د.ت)</label>
                <input type="number" step="0.001" inputMode="decimal" className={inp}
                  value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">إلى (اختياري)</label>
                <input type="number" step="0.001" inputMode="decimal" className={inp} placeholder="فارغ = سعر ثابت"
                  value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} />
              </div>
            </div>

            <label className="block text-sm font-semibold mb-1.5">ملاحظات (اختياري)</label>
            <input className={inp + ' mb-4'}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

            {formError && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-3 py-2 mb-3">{formError}</p>}

            <div className="flex items-center gap-2">
              <button disabled={saving}
                className="flex-1 bg-[#e4211b] text-white font-semibold text-sm px-5 py-3 rounded-lg disabled:opacity-60">
                {saving ? '...' : 'حفظ'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-5 py-3 text-sm font-semibold rounded-lg border border-[#e5e5e5] text-[#6b6b6b]">
                إلغاء
              </button>
              {editingId && (
                <button type="button" onClick={() => remove(editingId)}
                  className="px-4 py-3 text-sm font-semibold rounded-lg text-[#b3170f] hover:bg-[#fdeaea]">
                  🗑 حذف
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}