import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { t } from '../../i18n/LanguageContext'

const PERIODS = [
  { value: 'all', label: t('Tout le temps') },
  { value: 'month', label: t('Ce mois-ci') },
  { value: 'today', label: t('Aujourd\'hui') },
]

const SORT_OPTIONS = [
  { value: 'qty_desc', label: t('Les plus vendus') },
  { value: 'qty_asc', label: t('Les moins vendus') },
  { value: 'revenue_desc', label: t('Revenus : du plus élevé') },
  { value: 'revenue_asc', label: t('Revenus : du plus bas') },
  { value: 'price_desc', label: t('Prix : du plus élevé') },
  { value: 'price_asc', label: t('Prix : du plus bas') },
]

// Top-selling products — aggregates accessory_sales by product, client-side.
// A small shop's sales history is a few hundred/thousand rows at most, so one
// query + grouping in the browser is simpler than a SQL view and just as fast.
export default function Reports() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('month')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all') // all | accessory | phone
  const [sortBy, setSortBy] = useState('qty_desc')

  useEffect(() => { load() }, [period])

  async function load() {
    setLoading(true)
    setError(null)
    let q = supabase
      .from('accessory_sales')
      .select('id, quantity, total, unit_price, created_at, accessory_id, accessories(id, name, category, sale_price, image_url, is_deleted)')

    const now = new Date()
    if (period === 'today') q = q.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
    if (period === 'month') q = q.gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())

    const { data, error: e } = await q
    if (e) setError(e.message)
    setSales(data || [])
    setLoading(false)
  }

  // group sales rows by product
  const products = useMemo(() => {
    const map = new Map()
    for (const s of sales) {
      const a = s.accessories
      if (!a) continue
      if (!map.has(a.id)) {
        map.set(a.id, {
          id: a.id, name: a.name, category: a.category, sale_price: a.sale_price,
          image_url: a.image_url, is_deleted: a.is_deleted, qty: 0, revenue: 0, salesCount: 0,
        })
      }
      const p = map.get(a.id)
      p.qty += s.quantity
      p.revenue += Number(s.total)
      p.salesCount += 1
    }
    return [...map.values()]
  }, [sales])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = products.filter((p) => {
      const matchesCat = category === 'all' || p.category === category
      const matchesText = !q || p.name.toLowerCase().includes(q)
      return matchesCat && matchesText
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'qty_desc') return b.qty - a.qty
      if (sortBy === 'qty_asc') return a.qty - b.qty
      if (sortBy === 'revenue_desc') return b.revenue - a.revenue
      if (sortBy === 'revenue_asc') return a.revenue - b.revenue
      if (sortBy === 'price_desc') return b.sale_price - a.sale_price
      if (sortBy === 'price_asc') return a.sale_price - b.sale_price
      return 0
    })
    return list
  }, [products, search, category, sortBy])

  const totalQty = visible.reduce((s, p) => s + p.qty, 0)
  const totalRevenue = visible.reduce((s, p) => s + p.revenue, 0)

  const inp = 'px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Les plus vendus')}</h1>
          <p className="text-sm text-[#6b6b6b]">{t('Classement des produits (accessoires et téléphones) par quantité ou revenus')}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`shrink-0 text-sm px-4 py-2 rounded-lg font-semibold ${period === p.value ? 'bg-[#1a1a1a] text-white' : 'border border-[#e5e5e5] hover:bg-[#f7f7f7]'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
          <p className="text-xs text-[#6b6b6b] mb-1">{t('Articles vendus')}</p>
          <p className="text-xl font-extrabold text-[#1a1a1a]">{totalQty}</p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
          <p className="text-xs text-[#6b6b6b] mb-1">{t('Revenus totaux')}</p>
          <p className="text-xl font-extrabold text-[#1f8a4c]">{totalRevenue.toFixed(2)}  {t('DT')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Rechercher un produit')} className={inp + ' flex-1'} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inp + ' bg-white sm:w-56'}>
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2 mb-5">
        {[['all', t('Tout')], ['accessory', t('Accessoires')], ['phone', t('Téléphones')]].map(([v, l]) => (
          <button key={v} onClick={() => setCategory(v)}
            className={`text-sm px-4 py-2 rounded-lg border ${category === v ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl"><p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p></div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">
            {products.length === 0 ? t('Aucune vente sur cette période') : t('Aucun résultat pour cette recherche')}
          </p>
        </div>
      ) : (
        <>
          {/* phone: cards */}
          <div className="lg:hidden flex flex-col gap-3">
            {visible.map((p, i) => (
              <div key={p.id} className="bg-white border border-[#e5e5e5] rounded-xl p-4 flex gap-3">
                <div className="w-7 shrink-0 text-center text-xs font-bold text-[#6b6b6b] pt-1">#{i + 1}</div>
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#faf9f5] shrink-0 flex items-center justify-center text-lg">
                    {p.category === 'phone' ? '📱' : '🛍️'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#1a1a1a] text-sm">{p.name}{p.is_deleted && ' ' + t('(supprimé)')}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-[#6b6b6b]">{t('Vendus')} {p.qty}  {t('fois')}</span>
                    <span className="font-bold text-[#1f8a4c] text-sm">{p.revenue.toFixed(2)}  {t('DT')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* desktop: table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">#</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Produit')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Type')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Prix de vente')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Quantité vendue')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Revenus')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => (
                  <tr key={p.id} className="hover:bg-[#fbfaf6]">
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-[#6b6b6b]">{i + 1}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#faf9f5] flex items-center justify-center">
                            {p.category === 'phone' ? '📱' : '🛍️'}
                          </div>
                        )}
                        <span className="font-semibold">{p.name}{p.is_deleted && <span className="text-[#6b6b6b] font-normal">  {t('(supprimé)')}</span>}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                      {p.category === 'phone' ? t('Téléphone') : t('Accessoire')}
                    </td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4]">{Number(p.sale_price).toFixed(2)}  {t('DT')}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] font-semibold">{p.qty}</td>
                    <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold text-[#1f8a4c]">{p.revenue.toFixed(2)}  {t('DT')}</td>
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
