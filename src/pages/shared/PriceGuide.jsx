import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { t, getLocale } from '../../i18n/LanguageContext'
import { usePhoneModelNames } from '../../lib/usePhoneModels'

// Common part types shown as quick filter chips + suggestions in the form.
// Free text is still allowed (e.g. "بورت شحن") — this list is just a shortcut.
const COMMON_PARTS = [t('Écran'), t('Batterie'), t('Écouteur'), t('Caméra'), t('Port de charge'), t('Vitre arrière')]
// part names are typed by the team, so the icon is found for the Arabic (old data), French and English words
const PART_ICONS = {
  'شاشة': '🖥️', 'بطارية': '🔋', 'سماعة': '🔊', 'كاميرا': '📷', 'بورت شحن': '🔌', 'زجاج خلفي': '🪟',
  'Écran': '🖥️', 'Batterie': '🔋', 'Écouteur': '🔊', 'Caméra': '📷', 'Port de charge': '🔌', 'Vitre arrière': '🪟',
  'Screen': '🖥️', 'Battery': '🔋', 'Earpiece': '🔊', 'Camera': '📷', 'Charging port': '🔌', 'Back glass': '🪟',
}
const partIcon = (type) => PART_ICONS[type] || '🔧'

// quality shortcuts: a screen can have 2, 3 or 4 qualities, each with its own price
const QUALITY_SUGGESTIONS = [t('Original'), t('OLED'), t('Copie 1er choix'), t('Copie')]
// prices change often: a price not touched for 7 days gets a "check again" badge
const STALE_DAYS = 7
const isStale = (r) => r.updated_at && Date.now() - new Date(r.updated_at).getTime() > STALE_DAYS * 86400000
const fmtP = (min, max) =>
  min == null ? '—' : max != null && Number(max) !== Number(min) ? Number(min).toFixed(2) + '-' + Number(max).toFixed(2) : Number(min).toFixed(2)

function priceLabel(r) {
  const hasMax = r.price_max != null && Number(r.price_max) !== Number(r.price_min)
  return hasMax
    ? t('{price_min} - {price_max} DT', { price_min: Number(r.price_min).toFixed(2), price_max: Number(r.price_max).toFixed(2) })
    : t('{price_min} DT', { price_min: Number(r.price_min).toFixed(2) })
}

export default function PriceGuide() {
  const { user, profile } = useAuth()
  // All three roles (admin, comptoir, technicien) can add / edit / delete prices.
  const canEdit = ['admin', 'super_admin', 'technicien', 'comptoir'].includes(profile?.role)
  const phoneModels = usePhoneModelNames()
  const [params] = useSearchParams()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(params.get('model') || '')
  const [partFilter, setPartFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [catalogueAddHandled, setCatalogueAddHandled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [history, setHistory] = useState([])

  function emptyForm() {
    return { device_model: '', part_type: '', quality_label: '', price_min: '', price_max: '', buy_price: '', notes: '' }
  }

  useEffect(() => { load() }, [])

  // coming from the phone catalogue ("+ Ajouter une pièce"): open the form with the model filled in
  const catalogueModel = params.get('model')
  if (catalogueModel && params.get('add') === '1' && canEdit && !catalogueAddHandled) {
    setCatalogueAddHandled(true)
    setForm({ ...emptyForm(), device_model: catalogueModel })
    setShowForm(true)
  }

  async function load() {
    setLoading(true)
    setError(null)
    // two foreign keys to profiles (created_by / updated_by) -> name the one we want
    const { data, error: e } = await supabase
      .from('part_price_guide')
      .select(
        'id, device_model, part_type, quality_label, price_min, price_max, buy_price, notes, updated_at, ' +
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

  const partTypesInUse = useMemo(
    () => [...new Set(rows.map((r) => r.part_type))].sort(),
    [rows]
  )

  async function loadHistory(guideId) {
    const { data } = await supabase
      .from('part_price_history')
      .select('id, old_price_min, old_price_max, old_buy_price, new_price_min, new_price_max, new_buy_price, changed_at, profiles(full_name)')
      .eq('guide_id', guideId)
      .order('changed_at', { ascending: false })
      .limit(6)
    setHistory(data || [])
  }

  function openAdd() {
    setEditingId(null)
    setHistory([])
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(r) {
    setEditingId(r.id)
    setForm({
      device_model: r.device_model, part_type: r.part_type, quality_label: r.quality_label,
      price_min: r.price_min, price_max: r.price_max ?? '', buy_price: r.buy_price ?? '', notes: r.notes || '',
    })
    setFormError(null)
    setHistory([])
    loadHistory(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitForm(e) {
    e.preventDefault()
    setFormError(null)
    const min = Number(form.price_min)
    const max = form.price_max === '' ? null : Number(form.price_max)
    const buy = form.buy_price === '' ? null : Number(form.buy_price)
    if (!form.device_model.trim() || !form.part_type.trim() || !form.quality_label.trim() || min <= 0) {
      setFormError(t('Remplissez le modèle, le type de pièce, la qualité et au moins le prix « de »'))
      return
    }
    if (max !== null && max < min) {
      setFormError(t('« À » doit être supérieur ou égal à « De »'))
      return
    }
    if (buy !== null && !(buy >= 0)) {
      setFormError(t('Le prix d\'achat est invalide'))
      return
    }
    setSaving(true)
    const payload = {
      device_model: form.device_model.trim(),
      part_type: form.part_type.trim(),
      quality_label: form.quality_label.trim(),
      price_min: min,
      price_max: max,
      buy_price: buy,
      notes: form.notes.trim() || null,
    }
    const { error: err } = editingId
      ? await supabase.from('part_price_guide').update(payload).eq('id', editingId)
      : await supabase.from('part_price_guide').insert({ ...payload, created_by: user.id })
    setSaving(false)
    if (err) { setFormError(t('Erreur :') + ' ' + err.message); return }
    setShowForm(false)
    load()
  }

  async function remove(id) {
    if (!window.confirm(t('Supprimer définitivement ce prix ?'))) return
    const { error: err } = await supabase.from('part_price_guide').delete().eq('id', id)
    if (err) { alert(t('Échec :') + ' ' + err.message); return }
    load()
  }

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  function EditedBy({ r }) {
    if (!r.updated_at) return null
    return (
      <div className="mt-1">
        {r.buy_price != null && (
          <p className="text-[11px] text-[#6b6b6b]">
            {t('Achat : {price} DT', { price: Number(r.buy_price).toFixed(2) })}
            {' · '}
            {t('Marge : {price} DT', { price: (Number(r.price_min) - Number(r.buy_price)).toFixed(2) })}
          </p>
        )}
        <p className="text-[10px] text-[#9a9a9a]">
          {t('Dernière modification')} : {r.profiles?.full_name || '—'} · {new Date(r.updated_at).toLocaleDateString(getLocale())}
          {isStale(r) && <span className="ms-1.5 bg-[#fff4e0] text-[#b36b00] font-semibold px-1.5 py-0.5 rounded">{t('⚠️ À revérifier')}</span>}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Guide des prix')}</h1>
          <p className="text-sm text-[#6b6b6b]">{t('Prix estimatifs (de - à) selon le modèle du téléphone et le type de pièce')}</p>
        </div>
        {canEdit && (
          <button onClick={showForm ? () => setShowForm(false) : openAdd}
            className="w-full sm:w-auto bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg">
            {showForm ? t('Annuler') : t('+ Ajouter un prix')}
          </button>
        )}
      </div>

      {/* search + part-type chips */}
      <div className="mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Rechercher par modèle de téléphone ou type de pièce (ex. : iPhone 13 ou écran)')}
          className={inp + ' mb-3'}
        />
        {partTypesInUse.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            <button onClick={() => setPartFilter('')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${!partFilter ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
              
              {t('Tout')}
            </button>
            {partTypesInUse.map((p) => (
              <button key={p} onClick={() => setPartFilter(p === partFilter ? '' : p)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${partFilter === p ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
                <span>{partIcon(p)}</span>{p}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {canEdit && showForm && (
        <form onSubmit={submitForm} className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-6 mb-6 max-w-lg">
          <h3 className="font-bold text-sm mb-4">{editingId ? t('Modifier le prix') : t('Nouveau prix')}</h3>
          <label className="block text-sm font-semibold mb-1.5">{t('Modèle du téléphone')}</label>
          <input className={inp + ' mb-4'} placeholder={t('Ex. : iPhone 13 Pro')} list="phone-model-options"
            value={form.device_model} onChange={(e) => setForm({ ...form, device_model: e.target.value })} />
          <datalist id="phone-model-options">
            {phoneModels.map((n) => <option key={n} value={n} />)}
          </datalist>

          <label className="block text-sm font-semibold mb-1.5">{t('Type de pièce')}</label>
          <input className={inp + ' mb-2'} placeholder={t('Ex. : écran')}
            value={form.part_type} onChange={(e) => setForm({ ...form, part_type: e.target.value })} list="part-type-options" />
          <datalist id="part-type-options">
            {COMMON_PARTS.map((p) => <option key={p} value={p} />)}
          </datalist>
          <div className="flex gap-1.5 flex-wrap mb-4">
            {COMMON_PARTS.map((p) => (
              <button type="button" key={p} onClick={() => setForm({ ...form, part_type: p })}
                className="text-[11px] px-2.5 py-1 rounded-full border border-[#e5e5e5] text-[#6b6b6b] hover:border-[#e4211b] hover:text-[#e4211b]">
                {p}
              </button>
            ))}
          </div>

          <label className="block text-sm font-semibold mb-1.5">{t('Qualité / type (original, copie 1er choix...)')}</label>
          <input className={inp + ' mb-2'} placeholder={t('Ex. : original')}
            value={form.quality_label} onChange={(e) => setForm({ ...form, quality_label: e.target.value })} />
          <div className="flex gap-1.5 flex-wrap mb-4">
            {QUALITY_SUGGESTIONS.map((q) => (
              <button type="button" key={q} onClick={() => setForm({ ...form, quality_label: q })}
                className="text-[11px] px-2.5 py-1 rounded-full border border-[#e5e5e5] text-[#6b6b6b] hover:border-[#e4211b] hover:text-[#e4211b]">
                {q}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('De (DT)')}</label>
              <input type="number" step="0.001" className={inp}
                value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('À (DT) — facultatif')}</label>
              <input type="number" step="0.001" className={inp} placeholder={t('Laissez vide si le prix est fixe')}
                value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} />
            </div>
          </div>

          <label className="block text-sm font-semibold mb-1.5">{t('Prix d\'achat (DT) — facultatif')}</label>
          <input type="number" step="0.001" className={inp + ' mb-4'} placeholder={t('Ce que la pièce vous coûte')}
            value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} />

          <label className="block text-sm font-semibold mb-1.5">{t('Remarques (facultatif)')}</label>
          <input className={inp + ' mb-4'}
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {editingId && (
            <div className="mb-4">
              <p className="text-xs font-bold text-[#e4211b] mb-1.5">{t('Historique des prix')}</p>
              {history.length === 0 ? (
                <p className="text-xs text-[#6b6b6b]">{t('Aucun changement enregistré.')}</p>
              ) : (
                <ul className="text-xs text-[#6b6b6b] flex flex-col gap-1">
                  {history.map((h) => (
                    <li key={h.id}>
                      {t('{date} · {name} : {old} → {new}', {
                        date: new Date(h.changed_at).toLocaleDateString(getLocale()),
                        name: h.profiles?.full_name || '—',
                        old: fmtP(h.old_price_min, h.old_price_max),
                        new: fmtP(h.new_price_min, h.new_price_max),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {formError && <p className="text-[#b3170f] text-sm mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60">
              {saving ? '...' : t('Enregistrer')}
            </button>
            {editingId && (
              <button type="button" onClick={() => { remove(editingId); setShowForm(false) }}
                className="text-[#b3170f] text-sm px-4 py-2.5">
                
                {t('Supprimer')}
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p></div>
      ) : grouped.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">
            {rows.length === 0 ? t('Aucun prix enregistré pour le moment.') : t('Aucun résultat pour cette recherche.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([model, items]) => (
            <div key={model} className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-[#faf9f5] border-b border-[#e5e5e5] border-e-[3px] border-e-[#e4211b]">
                <span className="font-bold text-[#1a1a1a] text-sm">{model}</span>
                <span className="text-[11px] text-[#9a9a9a]">{t('{n} prix', { n: items.length })}</span>
              </div>

              {/* phone: stacked rows */}
              <div className="lg:hidden divide-y divide-[#f0f0ea]">
                {items.map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex gap-2.5">
                      <span className="text-base shrink-0">{partIcon(r.part_type)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1a1a1a]">{r.part_type} — {r.quality_label}</p>
                        {r.notes && <p className="text-xs text-[#6b6b6b] mt-0.5">{r.notes}</p>}
                        <EditedBy r={r} />
                      </div>
                    </div>
                    <div className="text-start shrink-0 flex flex-col items-end gap-1.5">
                      <span className="bg-[#eefaf1] text-[#1f8a4c] font-bold text-xs whitespace-nowrap px-2.5 py-1 rounded-full">
                        {priceLabel(r)}
                      </span>
                      {canEdit && (
                        <button onClick={() => openEdit(r)}
                          className="flex items-center gap-1 text-[11px] text-[#6b6b6b] border border-[#e5e5e5] rounded-lg px-2 py-1 hover:border-[#e4211b] hover:text-[#e4211b] transition-colors">
                          
                          {t('✏️ Modifier')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* desktop: table */}
              <table className="w-full text-sm hidden lg:table">
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-[#fbfaf6] border-b border-[#f0f0ea] last:border-b-0">
                      <td className="px-5 py-3 w-48 font-semibold">
                        <span className="ms-1.5">{partIcon(r.part_type)}</span>{r.part_type}
                      </td>
                      <td className="px-5 py-3 text-[#6b6b6b]">{r.quality_label}</td>
                      <td className="px-5 py-3 text-xs text-[#6b6b6b]">
                        {r.notes}
                        <EditedBy r={r} />
                      </td>
                      <td className="px-5 py-3">
                        <span className="bg-[#eefaf1] text-[#1f8a4c] font-bold text-xs whitespace-nowrap px-2.5 py-1 rounded-full">
                          {priceLabel(r)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3 text-start">
                          <button onClick={() => openEdit(r)}
                            className="flex items-center gap-1 text-xs text-[#6b6b6b] border border-[#e5e5e5] rounded-lg px-2.5 py-1.5 hover:border-[#e4211b] hover:text-[#e4211b] transition-colors">
                            
                            {t('✏️ Modifier')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
