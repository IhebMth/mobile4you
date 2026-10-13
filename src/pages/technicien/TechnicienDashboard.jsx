import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import { t } from '../../i18n/LanguageContext'

const SORT_OPTIONS = [
  { value: 'date_desc', label: t('Plus récents d\'abord') },
  { value: 'date_asc', label: t('Plus anciens d\'abord') },
]

export default function TechnicienDashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')

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

  // Search box + sort, both client-side (this technician's own list is small enough
  // that loading it once and filtering/sorting in the browser is simplest).
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = !q
      ? orders
      : orders.filter((o) =>
          [o.order_number, o.device_model, o.issue_description].join(' ').toLowerCase().includes(q)
        )
    list = [...list].sort((a, b) =>
      sortBy === 'date_asc'
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at)
    )
    return list
  }, [orders, search, sortBy])

  const inp = 'px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Appareils qui me sont assignés')}</h1>
        <p className="text-sm text-[#6b6b6b]">{orders.length}  {t('appareil(s) en cours de traitement')}</p>
      </div>

      {/* search + sort */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Rechercher par n° de commande, appareil ou description de la panne')}
          className={inp + ' flex-1'}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className={inp + ' bg-white sm:w-48'}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">
            {orders.length === 0 ? t('Aucun appareil ne vous est assigné pour le moment') : t('Aucun résultat pour cette recherche')}
          </p>
        </div>
      ) : (
        <>
          {/* Phone / tablet: one card per order, no sideways scrolling */}
          <div className="lg:hidden flex flex-col gap-3">
            {visibleOrders.map((o) => (
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
                <p className="text-[#e4211b] text-xs font-semibold mt-3">{t('Ouvrir les détails ←')}</p>
              </Link>
            ))}
          </div>

          {/* Desktop: the original table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('N° de commande')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Appareil')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Panne')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Statut')}</th>
                  <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => (
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
                        
                        {t('Ouvrir les détails')}
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
