import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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
    if (error) { alert('ما نجحش: ' + error.message); return }
    load()
  }

  const Row = ({ r, actions }) => (
    <tr className="hover:bg-[#fbfaf6]">
      <td className="px-5 py-3.5 border-b border-[#ececE4]">{r.profiles?.full_name}</td>
      <td className="px-5 py-3.5 border-b border-[#ececE4]">
        <div className="font-semibold">{r.cash_transactions?.description}</div>
        <div className="text-xs text-[#6b6b6b]">{Number(r.cash_transactions?.amount).toFixed(2)} د.ت</div>
      </td>
      <td className="px-5 py-3.5 border-b border-[#ececE4]">{r.reason}</td>
      <td className="px-5 py-3.5 border-b border-[#ececE4]">{actions}</td>
    </tr>
  )
  const Head = ({ last }) => (
    <thead>
      <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
        {['من', 'العملية', 'السبب', last].map((t) => (
          <th key={t} className="text-right px-5 py-3 border-b border-[#e5e5e5]">{t}</th>
        ))}
      </tr>
    </thead>
  )

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">طلبات الإلغاء</h1>
        <p className="text-sm text-[#6b6b6b]">{pending.length} طلب بانتظار الموافقة</p>
      </div>
      {loadError && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">خطأ في التحميل: {loadError}</p>}
      {loading ? <p className="text-sm text-[#6b6b6b]">جاري التحميل...</p> : (
        <>
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden mb-8">
            {pending.length === 0 ? <p className="p-6 text-sm text-[#6b6b6b]">لا توجد طلبات</p> : (
              <table className="w-full text-sm">
                <Head last="القرار" />
                <tbody>
                  {pending.map((r) => (
                    <Row key={r.id} r={r} actions={
                      <div className="flex flex-col gap-2">
                        <input placeholder="ملاحظة (اختياري)" value={notes[r.id] || ''}
                          onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          className="px-2.5 py-1.5 border border-[#e5e5e5] rounded-lg text-xs" />
                        <div className="flex gap-2">
                          <button onClick={() => review(r.id, true)}
                            className="bg-[#1f8a4c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg">قبول الإلغاء</button>
                          <button onClick={() => review(r.id, false)}
                            className="bg-[#b3170f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg">رفض</button>
                        </div>
                      </div>} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <h3 className="text-xs font-bold text-[#e4211b] mb-3">آخر القرارات</h3>
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            {history.length === 0 ? <p className="p-6 text-sm text-[#6b6b6b]">لا يوجد سجل بعد</p> : (
              <table className="w-full text-sm">
                <Head last="القرار" />
                <tbody>
                  {history.map((r) => (
                    <Row key={r.id} r={r} actions={
                      <span className={r.status === 'approved' ? 'text-[#1f8a4c] text-xs font-semibold' : 'text-[#b3170f] text-xs font-semibold'}>
                        {r.status === 'approved' ? '✔ مقبول' : '✖ مرفوض'}{r.review_note ? ` — ${r.review_note}` : ''}
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
