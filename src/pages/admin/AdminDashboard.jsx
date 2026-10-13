import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import LowStockAlert from '../shared/LowStockAlert'
import { t } from '../../i18n/LanguageContext'

const INCOME = ['repair_income', 'accessory_sale', 'debt_collection', 'loan_return']
const OUT = ['expense_out', 'withdrawal']
const money = (n) => t('{n} DT', { n: Number(n || 0).toFixed(2).replace(/\.00$/, '') })
const DAY = 24 * 3600 * 1000

function Card({ label, value, sub, to, tone = 'text-[#1a1a1a]' }) {
  const body = (
    <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 h-full hover:bg-[#fbfaf6]">
      <p className="text-xs text-[#6b6b6b] mb-1">{label}</p>
      <p className={`text-xl font-extrabold ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#9a9a9a] mt-1">{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

// Admin home: today's money, devices in the workshop, things waiting for the admin.
export default function AdminDashboard() {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const [tx, orders, voids, ge, re, debts] = await Promise.all([
      supabase.from('cash_transactions').select('type, amount').eq('is_void', false).gte('created_at', start.toISOString()),
      supabase.from('repair_orders').select('status, ready_at, created_at').in('status', ['received', 'diagnosing', 'in_repair', 'ready']),
      supabase.from('void_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('general_expenses').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabase.from('repair_expenses').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabase.from('debts').select('kind, amount, paid_amount').eq('status', 'open'),
    ])
    const err = [tx, orders, voids, ge, re, debts].find((r) => r.error)
    if (err) { setError(err.error.message); return }

    const sum = (types) => (tx.data || []).filter((tx) => types.includes(tx.type)).reduce((s, tx) => s + Number(tx.amount), 0)
    const income = sum(INCOME)
    const out = sum(OUT)
    const o = orders.data || []
    const now = Date.now()
    const count = (s) => o.filter((x) => x.status === s).length
    const rem = (kinds) => (debts.data || []).filter((x) => kinds.includes(x.kind)).reduce((s, x) => s + Number(x.amount) - Number(x.paid_amount), 0)

    setD({
      income, out, net: income - out,
      received: count('received'), diagnosing: count('diagnosing'), in_repair: count('in_repair'), ready: count('ready'),
      readyWaiting: o.filter((x) => x.status === 'ready' && x.ready_at && now - new Date(x.ready_at) > 2 * DAY).length,
      stuck: o.filter((x) => x.status !== 'ready' && now - new Date(x.created_at) > 3 * DAY).length,
      pending: (voids.count || 0) + (ge.count || 0) + (re.count || 0),
      owedToUs: rem(['client_unpaid', 'money_lent']),
      weOwe: rem(['supplier_unpaid']),
    })
  }, [])

  useEffect(() => {
    const run = () => {
      void load()
    }

    const initialTimer = setTimeout(run, 0)
    const interval = setInterval(run, 60000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [load])

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Tableau de bord')}</h1>
        <p className="text-sm text-[#6b6b6b]">{t('Résumé du jour et ce qui attend votre décision')}</p>
      </div>

      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{t('Erreur de chargement :')} {error}</p>}
      <LowStockAlert />

      {!d ? (
        <p className="text-sm text-[#6b6b6b]">{t('Chargement...')}</p>
      ) : (
        <>
          <h2 className="text-xs font-bold text-[#e4211b] mb-2">{t('Caisse du jour')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <Card label={t('Entrées')} value={money(d.income)} tone="text-[#1f8a4c]" to="/admin/reports/daily" />
            <Card label={t('Dépenses et retraits')} value={money(d.out)} tone="text-[#b3170f]" to="/admin/reports/daily" />
            <Card label={t('Net')} value={money(d.net)} tone={d.net >= 0 ? 'text-[#1f8a4c]' : 'text-[#b3170f]'} to="/caisse" />
          </div>

          <h2 className="text-xs font-bold text-[#e4211b] mb-2">{t('Appareils à l\'atelier')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card label={t('Reçues')} value={d.received} to="/comptoir" />
            <Card label={t('En diagnostic / réparation')} value={d.diagnosing + d.in_repair} to="/comptoir" />
            <Card label={t('Prêtes à livrer')} value={d.ready} sub={d.readyWaiting ? t('dont {readyWaiting} attendent depuis plus de 2 jours', { readyWaiting: d.readyWaiting }) : null} tone="text-[#1f8a4c]" to="/comptoir" />
            <Card label={t('En retard (+3 jours)')} value={d.stuck} tone={d.stuck ? 'text-[#b3170f]' : 'text-[#1a1a1a]'} to="/comptoir" />
          </div>

          <h2 className="text-xs font-bold text-[#e4211b] mb-2">{t('Attend votre décision')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card label={t('Demandes en attente d\'approbation')} value={d.pending} sub={t('Annulations + dépenses')} tone={d.pending ? 'text-[#b36b00]' : 'text-[#1a1a1a]'} to="/admin/expenses-approval" />
            <Card label={t('Dettes envers nous')} value={money(d.owedToUs)} to="/admin/debts" />
            <Card label={t('Dettes envers les autres')} value={money(d.weOwe)} to="/admin/debts" />
          </div>
        </>
      )}
    </div>
  )
}
