import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { t } from '../../i18n/LanguageContext'

function Head({ last }) {
  return (
    <thead className="bg-[#f5f5f5] text-left">
      <tr>
        <th className="px-4 py-3 font-semibold text-[#4c4c4c]">{t('Client')}</th>
        <th className="px-4 py-3 font-semibold text-[#4c4c4c]">{t('Motif')}</th>
        <th className="px-4 py-3 font-semibold text-[#4c4c4c]">{t('Transaction')}</th>
        <th className="px-4 py-3 font-semibold text-[#4c4c4c]">{t('Date')}</th>
        <th className="px-4 py-3 font-semibold text-[#4c4c4c] text-right">{last}</th>
      </tr>
    </thead>
  )
}

function Row({ r, actions }) {
  const tx = r.cash_transactions?.[0] || r.cash_transactions || null
  const amount = tx?.amount != null
    ? Number(tx.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : t('—')

  const date = r.reviewed_at || r.created_at
  const formattedDate = date
    ? new Date(date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : t('—')

  return (
    <tr className="border-t border-[#f0f0f0] align-top">
      <td className="px-4 py-3 text-[#1a1a1a]">{r.profiles?.full_name || t('Inconnu')}</td>
      <td className="px-4 py-3 text-[#1a1a1a] max-w-65 break-words">{r.reason || t('—')}</td>
      <td className="px-4 py-3 text-[#1a1a1a]">
        {tx ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#6b6b6b]">{tx.description || t('Transaction')}</span>
            <span className={tx.type === 'credit' ? 'text-[#1f8a4c] font-semibold' : 'text-[#b3170f] font-semibold'}>{amount}</span>
          </div>
        ) : t('—')}
      </td>
      <td className="px-4 py-3 text-[#6b6b6b] whitespace-nowrap">{formattedDate}</td>
      <td className="px-4 py-3 text-right">{actions}</td>
    </tr>
  )
}

export default function VoidRequests() {
  const [pending, setPending] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [notes, setNotes] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    // void_requests has TWO foreign keys to profiles -> name the one we want
    const cols =
      'id, reason, status, review_note, created_at, reviewed_at, ' +
      'profiles!void_requests_requested_by_fkey(full_name), ' +
      'cash_transactions(description, amount, type)'
    const { data: p, error: e1 } = await supabase.from('void_requests').select(cols)
      .eq('status', 'pending').order('created_at', { ascending: false })
    const { data: h, error: e2 } = await supabase.from('void_requests').select(cols)
      .neq('status', 'pending').order('reviewed_at', { ascending: false }).limit(20)
    if (e1 || e2) setLoadError((e1 || e2).message)
    setPending(p || [])
    setHistory(h || [])
    setLoading(false)
  }

  async function review(id, approve) {
    const { error } = await supabase.rpc('review_void_request', {
      p_id: id, p_approve: approve, p_note: notes[id]?.trim() || null,
    })
    if (error) { alert(t('Échec :') + ' ' + error.message); return }
    load()
  }

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Demandes d\'annulation')}</h1>
        <p className="text-sm text-[#6b6b6b]">{pending.length}  {t('demande(s) en attente d\'approbation')}</p>
      </div>
      {loadError && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{t('Erreur de chargement :')} {loadError}</p>}
      {loading ? <p className="text-sm text-[#6b6b6b]">{t('Chargement...')}</p> : (
        <>
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden mb-8">
            {pending.length === 0 ? <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucune demande')}</p> : (
              <table className="w-full text-sm">
                <Head last={t('Décision')} />
                <tbody>
                  {pending.map((r) => (
                    <Row key={r.id} r={r} actions={
                      <div className="flex flex-col gap-2">
                        <input placeholder={t('Note (facultatif)')} value={notes[r.id] || ''}
                          onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          className="px-2.5 py-1.5 border border-[#e5e5e5] rounded-lg text-xs" />
                        <div className="flex gap-2">
                          <button onClick={() => review(r.id, true)}
                            className="bg-[#1f8a4c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{t('Accepter l\'annulation')}</button>
                          <button onClick={() => review(r.id, false)}
                            className="bg-[#b3170f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{t('Refuser')}</button>
                        </div>
                      </div>} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <h3 className="text-xs font-bold text-[#e4211b] mb-3">{t('Dernières décisions')}</h3>
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            {history.length === 0 ? <p className="p-6 text-sm text-[#6b6b6b]">{t('Aucun historique pour le moment')}</p> : (
              <table className="w-full text-sm">
                <Head last={t('Décision')} />
                <tbody>
                  {history.map((r) => (
                    <Row key={r.id} r={r} actions={
                      <span className={r.status === 'approved' ? 'text-[#1f8a4c] text-xs font-semibold' : 'text-[#b3170f] text-xs font-semibold'}>
                        {r.status === 'approved' ? t('✔ Accepté') : t('✖ Refusé')}{r.review_note ? ` — ${r.review_note}` : ''}
                      </span>} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
