import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import VoidRequestButton from '../shared/VoidRequestButton'
import { t, getLocale } from '../../i18n/LanguageContext'

const TYPE_LABELS = {
  repair_income: t('Revenu de réparation'),
  accessory_sale: t('Vendre un accessoire'),
  withdrawal: t('Retrait'),
  debt_collection: t('Encaissement d\'une dette'),
  loan_return: t('Avance remboursée'),
}

const SOURCE_LABELS = {
  repair_part: t('Dépense de pièce détachée'),
  general: t('Dépense générale'),
  loan_out: t('Avance prise sur la caisse'),
  debt_payment: t('Remboursement d\'une dette'),
}

const INCOME_TYPES = ['repair_income', 'accessory_sale', 'debt_collection', 'loan_return']
const isIncome = (tx) => INCOME_TYPES.includes(tx.type)

function labelOf(tx) {
  if (tx.type === 'expense_out') return SOURCE_LABELS[tx.source_type] || t('Dépense')
  // type stays "accessory_sale" for both regular accessories and phones —
  // source_type is what actually tells them apart
  if (tx.type === 'accessory_sale' && tx.source_type === 'phone_sale') return t('Vente d\'un téléphone')
  return TYPE_LABELS[tx.type] || tx.type
}

export default function Caisse() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('today') // today | month | all

  useEffect(() => {
    loadTransactions()
  }, [filter])

  async function loadTransactions() {
    setLoading(true)
    setError(null)

    // "description" is written by the DB triggers (item + order number, or the
    // general expense text), so comptoir can read it without touching
    // repair_expenses / general_expenses (which RLS hides from them).
    let query = supabase
      .from('cash_transactions')
      .select('id, type, source_type, description, amount, created_at, profiles!cash_transactions_performed_by_fkey(full_name)')
      .eq('is_void', false) // voided rows never count
      .order('created_at', { ascending: false })

    const now = new Date()
    if (filter === 'today') {
      query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
    } else if (filter === 'month') {
      query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
    }

    const { data, error: qError } = await query
    if (qError) setError(qError.message)
    setTransactions(data || [])
    setLoading(false)
  }

  const income = transactions.filter(isIncome).reduce((s, tx) => s + Number(tx.amount), 0)
  const expenses = transactions.filter((tx) => !isIncome(tx)).reduce((s, tx) => s + Number(tx.amount), 0)
  const net = income - expenses

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Caisse')}</h1>
          <p className="text-sm text-[#6b6b6b]">{t('Entrées et sorties de la caisse')}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          {[
            { key: 'today', label: t('Aujourd\'hui') },
            { key: 'month', label: t('Ce mois-ci') },
            { key: 'all', label: t('Tout') },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 text-sm px-4 py-2 rounded-lg font-semibold ${
                filter === f.key
                  ? 'bg-[#1a1a1a] text-white'
                  : 'border border-[#e5e5e5] text-[#1a1a1a] hover:bg-[#f7f7f7]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">
          
          {t('Erreur de chargement :')} {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#6b6b6b] mb-1">{t('Entrées')}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[#1f8a4c]">{income.toFixed(2)}  {t('DT')}</p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#6b6b6b] mb-1">{t('Dépenses')}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[#b3170f]">{expenses.toFixed(2)}  {t('DT')}</p>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#6b6b6b] mb-1">{t('Net')}</p>
          <p className={`text-xl sm:text-2xl font-extrabold ${net >= 0 ? 'text-[#1f8a4c]' : 'text-[#b3170f]'}`}>
            {net.toFixed(2)}  {t('DT')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucune opération sur cette période')}</p>
        </div>
      ) : (
        <>
          {/* Phone / tablet: one card per transaction, nothing squeezed sideways */}
          <div className="lg:hidden flex flex-col gap-3">
            {transactions.map((tx) => {
              const inc = isIncome(tx)
              return (
                <div key={tx.id} className="bg-white border border-[#e5e5e5] rounded-xl p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1a1a1a] text-sm">{labelOf(tx)}</p>
                      {tx.description && (
                        <p className="text-xs text-[#6b6b6b] mt-0.5 break-words">{tx.description}</p>
                      )}
                    </div>
                    <p className={`font-bold text-sm whitespace-nowrap ${inc ? 'text-[#1f8a4c]' : 'text-[#b3170f]'}`}>
                      {inc ? '+' : '-'}
                      {Number(tx.amount).toFixed(2)}  {t('DT')}
                    </p>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#f0f0ea] text-xs text-[#6b6b6b]">
                    <span>{tx.profiles?.full_name || '—'} · {new Date(tx.created_at).toLocaleString(getLocale())}</span>
                    <VoidRequestButton tx={tx} onDone={loadTransactions} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: the original table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Type')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Détail')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Montant')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Par')}</th>
                  <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Date')}</th>
                  <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const inc = isIncome(tx)
                  return (
                    <tr key={tx.id} className="hover:bg-[#fbfaf6]">
                      <td className="px-5 py-3.5 border-b border-[#ececE4]">{labelOf(tx)}</td>
                      <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                        {tx.description || '—'}
                      </td>
                      <td
                        className={`px-5 py-3.5 border-b border-[#ececE4] font-bold ${
                          inc ? 'text-[#1f8a4c]' : 'text-[#b3170f]'
                        }`}
                      >
                        {inc ? '+' : '-'}
                        {Number(tx.amount).toFixed(2)}  {t('DT')}
                      </td>
                      <td className="px-5 py-3.5 border-b border-[#ececE4] text-[#6b6b6b]">
                        {tx.profiles?.full_name || '—'}
                      </td>
                      <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                        {new Date(tx.created_at).toLocaleString(getLocale())}
                      </td>
                      <td className="px-5 py-3.5 border-b border-[#ececE4]">
                        <VoidRequestButton tx={tx} onDone={loadTransactions} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
