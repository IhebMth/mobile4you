import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../i18n/LanguageContext'

// Shop-wide spending NOT tied to a repair (water, paper, taxi...).
// Available to admin, comptoir and technicien. Needs admin approval.
export default function GeneralExpenses() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) loadExpenses()
  }, [user])

  async function loadExpenses() {
    setLoading(true)
    const { data } = await supabase
      .from('general_expenses')
      .select('id, description, amount, is_approved, created_at')
      .eq('spent_by', user.id)
      .order('created_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!description.trim() || !amount || Number(amount) <= 0) {
      setError(t('Remplissez correctement la description et le montant'))
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('general_expenses').insert({
      spent_by: user.id,
      description: description.trim(),
      amount: Number(amount),
    })
    setSaving(false)

    if (insertError) {
      setError(t('Erreur :') + ' ' + insertError.message)
      return
    }

    setDescription('')
    setAmount('')
    setShowForm(false)
    loadExpenses()
  }

  const totalPending = expenses
    .filter((e) => !e.is_approved)
    .reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div>
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Dépenses générales')}</h1>
          <p className="text-sm text-[#6b6b6b]">
            {totalPending > 0
              ? t('{totalPending} DT en attente de validation par le gérant', { totalPending: totalPending.toFixed(2) })
              : t('Toutes vos dépenses sont validées')}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90"
        >
          {showForm ? t('Annuler') : t('+ Enregistrer une dépense')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#e5e5e5] rounded-xl p-6 mb-6 max-w-lg"
        >
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">{t('Description de la dépense (pour quoi avez-vous dépensé ?)')}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Exemple : bouteille d\'eau, papier d\'impression, taxi...')}
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">{t('Montant')}</label>
            <input
              type="number"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('En dinars')}
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              required
            />
          </div>

          {error && <p className="text-[#b3170f] text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? t('Enregistrement...') : t('Ajouter')}
          </button>
        </form>
      )}

      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-[#6b6b6b]">{t('Chargement...')}</p>
        ) : expenses.length === 0 ? (
          <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucune dépense enregistrée pour le moment')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Description')}</th>
                <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Montant')}</th>
                <th className="text-left px-5 py-3 border-b border-[#e5e5e5]">{t('Statut')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-[#fbfaf6]">
                  <td className="px-5 py-3.5 border-b border-[#ececE4] font-semibold">{e.description}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">{Number(e.amount).toFixed(2)}  {t('DT')}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">
                    {e.is_approved ? (
                      <span className="text-[#1f8a4c] text-xs font-semibold">{t('✔ Validée')}</span>
                    ) : (
                      <span className="text-[#c9750a] text-xs font-semibold">{t('En attente de validation')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
