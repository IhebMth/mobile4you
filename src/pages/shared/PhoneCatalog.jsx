import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../i18n/LanguageContext'

const PORTS = ['USB-C', 'Lightning', 'Micro-USB']
const SCREEN_TYPES = ['IPS LCD', 'PLS LCD', 'AMOLED', 'Super AMOLED', 'Dynamic AMOLED', 'OLED']

function emptyForm() {
  return {
    brand: '', name: '', release_year: '', screen_size: '', screen_type: '', battery_mah: '',
    charge_port: 'USB-C', chipset: '', ram_gb: '', storage_gb: '',
    market_price_min: '', market_price_max: '', notes: '', specs_verified: false,
  }
}

const num = (v) => (v === '' || v == null ? null : Number(v))

function specLine(m) {
  return [
    m.screen_size ? m.screen_size + '"' : null,
    m.screen_type,
    m.battery_mah ? m.battery_mah + ' mAh' : null,
    m.charge_port,
  ].filter(Boolean).join(' · ')
}

function priceText(min, max) {
  if (min == null) return '—'
  const hasMax = max != null && Number(max) !== Number(min)
  return hasMax
    ? t('{price_min} - {price_max} DT', { price_min: Number(min).toFixed(2), price_max: Number(max).toFixed(2) })
    : t('{price_min} DT', { price_min: Number(min).toFixed(2) })
}

function SpecRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[#f0f0ea] last:border-b-0 text-sm">
      <span className="text-[#6b6b6b]">{label}</span>
      <span className="font-semibold text-[#1a1a1a] text-end">{value}</span>
    </div>
  )
}

export default function PhoneCatalog() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role)

  const [models, setModels] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [openId, setOpenId] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    const [m, p] = await Promise.all([
      supabase.from('phone_models').select('*').order('brand', { ascending: true }).order('name', { ascending: true }),
      supabase.from('part_price_guide').select('id, device_model, part_type, quality_label, price_min, price_max, buy_price'),
    ])
    if (m.error) setError(m.error.message)
    else if (p.error) setError(p.error.message)
    setModels(m.data || [])
    setParts(p.data || [])
    setLoading(false)
  }

  // parts of each model: matched on the model name (not case sensitive)
  const partsByModel = useMemo(() => {
    const map = new Map()
    for (const r of parts) {
      const k = (r.device_model || '').trim().toLowerCase()
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(r)
    }
    return map
  }, [parts])

  const brands = useMemo(() => [...new Set(models.map((m) => m.brand))].sort(), [models])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return models.filter((m) => {
      const okText = !q || m.name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q) || (m.chipset || '').toLowerCase().includes(q)
      const okBrand = !brand || m.brand === brand
      return okText && okBrand
    })
  }, [models, search, brand])

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(m) {
    setEditingId(m.id)
    setForm({
      brand: m.brand || '', name: m.name || '', release_year: m.release_year ?? '', screen_size: m.screen_size ?? '',
      screen_type: m.screen_type || '', battery_mah: m.battery_mah ?? '', charge_port: m.charge_port || '',
      chipset: m.chipset || '', ram_gb: m.ram_gb || '', storage_gb: m.storage_gb || '',
      market_price_min: m.market_price_min ?? '', market_price_max: m.market_price_max ?? '',
      notes: m.notes || '', specs_verified: !!m.specs_verified,
    })
    setFormError(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitForm(e) {
    e.preventDefault()
    setFormError(null)
    const min = num(form.market_price_min)
    const max = num(form.market_price_max)
    if (!form.brand.trim() || !form.name.trim()) {
      setFormError(t('Remplissez la marque et le nom du modèle'))
      return
    }
    if (min !== null && !(min > 0)) { setFormError(t('Le prix doit être supérieur à 0')); return }
    if (max !== null && min === null) { setFormError(t('Indiquez d\'abord le prix « de »')); return }
    if (max !== null && max < min) { setFormError(t('« À » doit être supérieur ou égal à « De »')); return }
    setSaving(true)
    const payload = {
      brand: form.brand.trim(),
      name: form.name.trim(),
      release_year: num(form.release_year),
      screen_size: num(form.screen_size),
      screen_type: form.screen_type.trim() || null,
      battery_mah: num(form.battery_mah),
      charge_port: form.charge_port || null,
      chipset: form.chipset.trim() || null,
      ram_gb: form.ram_gb.trim() || null,
      storage_gb: form.storage_gb.trim() || null,
      market_price_min: min,
      market_price_max: max,
      notes: form.notes.trim() || null,
      specs_verified: !!form.specs_verified,
    }
    const { error: err } = editingId
      ? await supabase.from('phone_models').update(payload).eq('id', editingId)
      : await supabase.from('phone_models').insert(payload)
    setSaving(false)
    if (err) {
      setFormError(err.code === '23505' ? t('Ce modèle existe déjà') : t('Erreur :') + ' ' + err.message)
      return
    }
    setShowForm(false)
    load()
  }

  async function remove(id) {
    if (!window.confirm(t('Supprimer ce modèle ?'))) return
    const { error: err } = await supabase.from('phone_models').delete().eq('id', id)
    if (err) { alert(t('Échec :') + ' ' + err.message); return }
    setShowForm(false)
    load()
  }

  const goParts = (m, add) =>
    navigate('/price-guide?model=' + encodeURIComponent(m.name) + (add ? '&add=1' : ''))

  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Catalogue téléphones')}</h1>
          <p className="text-sm text-[#6b6b6b]">{t('Fiches techniques et prix des pièces par modèle')}</p>
        </div>
        <button onClick={showForm ? () => setShowForm(false) : openAdd}
          className="w-full sm:w-auto bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg">
          {showForm ? t('Annuler') : t('+ Ajouter un modèle')}
        </button>
      </div>

      <div className="mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} className={inp + ' mb-3'}
          placeholder={t('Rechercher un modèle (ex. : A15, Redmi Note 12, iPhone 13)')} />
        {brands.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            <button onClick={() => setBrand('')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${!brand ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
              {t('Tout')}
            </button>
            {brands.map((b) => (
              <button key={b} onClick={() => setBrand(b === brand ? '' : b)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${brand === b ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={submitForm} className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-6 mb-6 max-w-lg">
          <h3 className="font-bold text-sm mb-4">{editingId ? t('Modifier le modèle') : t('Nouveau modèle')}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Marque')}</label>
              <input className={inp} list="brand-options" placeholder="Samsung" value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <datalist id="brand-options">{brands.map((b) => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Nom du modèle')}</label>
              <input className={inp} placeholder="Samsung Galaxy A15" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Année')}</label>
              <input type="number" className={inp} value={form.release_year}
                onChange={(e) => setForm({ ...form, release_year: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Taille de l\'écran (pouces)')}</label>
              <input type="number" step="0.01" className={inp} value={form.screen_size}
                onChange={(e) => setForm({ ...form, screen_size: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Type d\'écran')}</label>
              <input className={inp} list="screen-type-options" value={form.screen_type}
                onChange={(e) => setForm({ ...form, screen_type: e.target.value })} />
              <datalist id="screen-type-options">{SCREEN_TYPES.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Batterie (mAh)')}</label>
              <input type="number" className={inp} value={form.battery_mah}
                onChange={(e) => setForm({ ...form, battery_mah: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Port de charge')}</label>
              <select className={inp} value={form.charge_port}
                onChange={(e) => setForm({ ...form, charge_port: e.target.value })}>
                <option value="">—</option>
                {PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Processeur')}</label>
              <input className={inp} value={form.chipset}
                onChange={(e) => setForm({ ...form, chipset: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('RAM (Go)')}</label>
              <input className={inp} placeholder="4/6/8" value={form.ram_gb}
                onChange={(e) => setForm({ ...form, ram_gb: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Stockage (Go)')}</label>
              <input className={inp} placeholder="64/128/256" value={form.storage_gb}
                onChange={(e) => setForm({ ...form, storage_gb: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('Prix du téléphone — de (DT)')}</label>
              <input type="number" step="0.001" className={inp} value={form.market_price_min}
                onChange={(e) => setForm({ ...form, market_price_min: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">{t('À (DT) — facultatif')}</label>
              <input type="number" step="0.001" className={inp} value={form.market_price_max}
                onChange={(e) => setForm({ ...form, market_price_max: e.target.value })} />
            </div>
          </div>

          <label className="block text-sm font-semibold mb-1.5">{t('Remarques (facultatif)')}</label>
          <input className={inp + ' mb-4'} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={form.specs_verified}
              onChange={(e) => setForm({ ...form, specs_verified: e.target.checked })} />
            {t('Fiche vérifiée')}
          </label>

          {formError && <p className="text-[#b3170f] text-sm mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-60">
              {saving ? '...' : t('Enregistrer')}
            </button>
            {editingId && isAdmin && (
              <button type="button" onClick={() => remove(editingId)} className="text-[#b3170f] text-sm px-4 py-2.5">
                {t('Supprimer')}
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">
            {models.length === 0 ? t('Aucun modèle pour le moment.') : t('Aucun résultat pour cette recherche.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((m) => {
            const isOpen = openId === m.id
            const mp = [...(partsByModel.get(m.name.trim().toLowerCase()) || [])]
              .sort((a, b) => a.part_type.localeCompare(b.part_type) || Number(a.price_min) - Number(b.price_min))
            return (
              <div key={m.id} className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
                <button type="button" onClick={() => setOpenId(isOpen ? null : m.id)}
                  className="w-full text-start px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#1a1a1a]">{m.name}</p>
                    <p className="text-xs text-[#6b6b6b] mt-0.5">{specLine(m)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {mp.length > 0 && (
                      <span className="bg-[#eefaf1] text-[#1f8a4c] text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {t('{n} pièces', { n: mp.length })}
                      </span>
                    )}
                    <span className="text-[#9a9a9a] text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-[#f0f0ea]">
                    <div className="pt-2 mb-3">
                      <SpecRow label={t('Marque')} value={m.brand} />
                      <SpecRow label={t('Année')} value={m.release_year} />
                      <SpecRow label={t('Écran')} value={m.screen_size ? m.screen_size + '" ' + (m.screen_type || '') : m.screen_type} />
                      <SpecRow label={t('Batterie')} value={m.battery_mah ? m.battery_mah + ' mAh' : null} />
                      <SpecRow label={t('Port de charge')} value={m.charge_port} />
                      <SpecRow label={t('Processeur')} value={m.chipset} />
                      <SpecRow label={t('RAM (Go)')} value={m.ram_gb} />
                      <SpecRow label={t('Stockage (Go)')} value={m.storage_gb} />
                      <SpecRow label={t('Prix du téléphone')} value={m.market_price_min != null ? priceText(m.market_price_min, m.market_price_max) : null} />
                      <SpecRow label={t('Remarques')} value={m.notes} />
                    </div>
                    <p className={`text-xs mb-3 ${m.specs_verified ? 'text-[#1f8a4c]' : 'text-[#b36b00]'}`}>
                      {m.specs_verified ? t('✅ Fiche vérifiée') : t('⚠️ Fiche à vérifier')}
                    </p>

                    <h4 className="text-xs font-bold text-[#e4211b] mb-2">{t('Pièces et prix')}</h4>
                    {mp.length === 0 ? (
                      <p className="text-xs text-[#6b6b6b] mb-3">{t('Aucune pièce enregistrée pour ce modèle.')}</p>
                    ) : (
                      <div className="mb-3">
                        {mp.map((r) => (
                          <div key={r.id} className="flex justify-between items-center gap-3 py-1.5 border-b border-[#f0f0ea] last:border-b-0 text-sm">
                            <span className="min-w-0">
                              {r.part_type} — {r.quality_label}
                              {r.buy_price != null && (
                                <span className="block text-[11px] text-[#9a9a9a]">{t('Achat : {price} DT', { price: Number(r.buy_price).toFixed(2) })}</span>
                              )}
                            </span>
                            <span className="bg-[#eefaf1] text-[#1f8a4c] font-bold text-xs whitespace-nowrap px-2.5 py-1 rounded-full">
                              {priceText(r.price_min, r.price_max)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => goParts(m, true)}
                        className="bg-[#e4211b] text-white text-xs font-semibold px-3.5 py-2 rounded-lg">
                        {t('+ Ajouter une pièce')}
                      </button>
                      <button onClick={() => goParts(m, false)}
                        className="text-xs text-[#6b6b6b] border border-[#e5e5e5] rounded-lg px-3.5 py-2">
                        {t('💲 Voir dans le guide des prix')}
                      </button>
                      <button onClick={() => openEdit(m)}
                        className="text-xs text-[#6b6b6b] border border-[#e5e5e5] rounded-lg px-3.5 py-2">
                        {t('✏️ Modifier la fiche')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
