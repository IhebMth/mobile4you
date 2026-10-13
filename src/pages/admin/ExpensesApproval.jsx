import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../i18n/LanguageContext'

export default function ExpensesApproval() {
  const { user } = useAuth()
  const [repairExpenses, setRepairExpenses] = useState([])
  const [generalExpenses, setGeneralExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    loadPending()
  }, [])

  async function loadPending() {
    setLoading(true)
    setLoadError(null)

    // NOTE the "!..._fkey" hints: these tables each have TWO foreign keys to
    // profiles (spent_by + approved_by, and repair_expenses also technician_id).
    // Without the hint PostgREST answers "more than one relationship" (PGRST201).
    const { data: repairData, error: e1 } = await supabase
      .from('repair_expenses')
      .select(
        'id, item_name, supplier, purchase_price, quantity, created_at, profiles!repair_expenses_spent_by_fkey(full_name), repair_orders(order_number)'
      )
      .eq('is_approved', false)
      .order('created_at', { ascending: false })

    const { data: generalData, error: e2 } = await supabase
      .from('general_expenses')
      .select('id, description, amount, created_at, profiles!general_expenses_spent_by_fkey(full_name)')
      .eq('is_approved', false)
      .order('created_at', { ascending: false })

    if (e1 || e2) setLoadError((e1 || e2).message)

    setRepairExpenses(repairData || [])
    setGeneralExpenses(generalData || [])
    setLoading(false)
  }

  async function approve(table, id) {
    const { error } = await supabase
      .from(table)
      .update({ is_approved: true, approved_by: user.id })
      .eq('id', id)
    if (error) {
      alert(t('Échec de la validation :') + ' ' + error.message)
      return
    }
    loadPending()
  }

  const totalPending = repairExpenses.length + generalExpenses.length

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Validation des dépenses')}</h1>
        <p className="text-sm text-[#6b6b6b]">{totalPending}  {t('dépense(s) en attente de validation')}</p>
      </div>

      {loadError && (
        <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">
          
          {t('Erreur de chargement :')} {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#6b6b6b]">{t('Chargement...')}</p>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="text-xs font-bold text-[#e4211b] mb-3">{t('Frais de pièces détachées')}</h3>
            <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
              {repairExpenses.length === 0 ? (
                <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucune dépense de pièces en attente de validation')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('De')}</th>
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Commande')}</th>
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Pièce')}</th>
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Montant')}</th>
                      <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {repairExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-[#fbfaf6]">
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">{e.profiles?.full_name}</td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4] text-xs text-[#6b6b6b]">
                          {e.repair_orders?.order_number}
                        </td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">{e.item_name}</td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold">
                          {(e.purchase_price * e.quantity).toFixed(2)}  {t('DT')}
                        </td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">
                          <button
                            onClick={() => approve('repair_expenses', e.id)}
                            className="bg-[#1f8a4c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90"
                          >
                            
                            {t('Valider')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-[#e4211b] mb-3">{t('Dépenses générales')}</h3>
            <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
              {generalExpenses.length === 0 ? (
                <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucune dépense générale en attente de validation')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('De')}</th>
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Description')}</th>
                      <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Montant')}</th>
                      <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-[#fbfaf6]">
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">{e.profiles?.full_name}</td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">{e.description}</td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4] font-bold">
                          {Number(e.amount).toFixed(2)}  {t('DT')}
                        </td>
                        <td className="px-5 py-3.5 border-b border-[#ececE4]">
                          <button
                            onClick={() => approve('general_expenses', e.id)}
                            className="bg-[#1f8a4c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90"
                          >
                            
                            {t('Valider')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
