import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const KINDS = {
  client_unpaid: { label: 'ديون الحرفاء (ما خلصوش)', party: 'اسم الحريف', dir: 'receivable' },
  supplier_unpaid: { label: 'عليّ للموردين (شريت وما خلصتش)', party: 'اسم المورد / البائع', dir: 'payable' },
  money_lent: { label: 'فلوس سلّفتها (ما رجعتش)', party: 'اسم الشخص', dir: 'receivable' },
}

// One page for comptoir (client debts only) and admin (all 3 kinds).
// RLS already hides the other kinds from comptoir; we also hide the tabs.
export default function Debts() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const kinds = isAdmin ? Object.keys(KINDS) : ['client_unpaid']
  const [tab, setTab] = useState('client_unpaid')
  const [debts, setDebts] = useState([])
  const [showSettled, setShowSettled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ party_name: '', description: '', amount: '', due_date: '', from_register: false })
  const [payingId, setPayingId] = useState(null)
  const [pay, setPay] = useState({ amount: '', fromRegister: false })

  useEffect(() => { if (user) load() }, [user, tab, showSettled])

  async function load() {
    setLoading(true)
    setError(null)
    let q = supabase.from('debts')
      .select('id, party_name, description, amount, paid_amount, status, due_date, from_register, created_at')
      .eq('kind', tab).order('created_at', { ascending: false })
    if (!showSettled) q = q.eq('status', 'open')
    const { data, error: e } = await q
    if (e) setError(e.message)
    setDebts(data || [])
    setLoading(false)
  }

  async function addDebt(e) {
    e.preventDefault()
    setError(null)
    if (!form.party_name.trim() || !form.description.trim() || Number(form.amount) <= 0) {
      setError('عمر الاسم والوصف والمبلغ')
      return
    }
    const { error: err } = await supabase.from('debts').insert({
      kind: tab, party_name: form.party_name.trim(), description: form.description.trim(),
      amount: Number(form.amount), due_date: form.due_date || null, created_by: user.id,
      from_register: tab === 'money_lent' && form.from_register,
    })
    if (err) { setError('خطأ: ' + err.message); return }
    setForm({ party_name: '', description: '', amount: '', due_date: '', from_register: false })
    setShowForm(false)
    load()
  }

  async function submitPayment(d) {
    const { error: err } = await supabase.rpc('add_debt_payment', {
      p_debt: d.id, p_amount: Number(pay.amount), p_from_register: pay.fromRegister, p_note: null,
    })
    if (err) { alert('ما نجحش: ' + err.message); return }
    setPayingId(null)
    setPay({ amount: '', fromRegister: false })
    load()
  }

  const remaining = (d) => Number(d.amount) - Number(d.paid_amount)
  const total = debts.reduce((s, d) => s + remaining(d), 0)
  const today = new Date().toISOString().slice(0, 10)
  const inp = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

  // Shared "pay / collect" control — same markup used inside the mobile
  // card and the desktop table cell, so the two never drift apart.
  function PaymentControl({ d }) {
    if (d.status !== 'open') return null
    if (payingId !== d.id) {
      return (
        <button
          onClick={() => { setPayingId(d.id); setPay({ amount: remaining(d).toFixed(3), fromRegister: false }) }}
          className="bg-[#1a1a1a] text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          {KINDS[tab].dir === 'payable' ? 'تسديد' : 'استلام دفعة'}
        </button>
      )
    }
    return (
      <div className="flex flex-col gap-2 sm:w-40">
        <input
          type="number" step="0.001" placeholder="المبلغ" value={pay.amount}
          onChange={(e) => setPay({ ...pay, amount: e.target.value })}
          className="px-2.5 py-1.5 border border-[#e5e5e5] rounded-lg text-xs"
        />
        {tab === 'supplier_unpaid' && (
          <label className="text-xs flex gap-1.5 items-center">
            <input type="checkbox" checked={pay.fromRegister}
              onChange={(e) => setPay({ ...pay, fromRegister: e.target.checked })} /> من الصندوق
          </label>
        )}
        <div className="flex gap-2">
          <button onClick={() => submitPayment(d)} className="bg-[#1f8a4c] text-white text-xs px-3 py-1.5 rounded-lg">حفظ</button>
          <button onClick={() => setPayingId(null)} className="text-xs px-2">×</button>
        </div>
      </div>
    )
  }

  function StatusPill({ d }) {
    const late = d.status === 'open' && d.due_date && d.due_date < today
    if (d.status === 'settled') return <span className="text-[#1f8a4c] font-semibold text-xs">✔ مسدّد</span>
    return (
      <span className={`text-xs font-semibold ${late ? 'text-[#b3170f]' : 'text-[#c9750a]'}`}>
        {late ? 'متأخر ' : 'مفتوح '}{d.due_date || ''}
      </span>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">الديون</h1>
          <p className="text-sm text-[#6b6b6b]">
            {KINDS[tab].dir === 'payable' ? 'المتبقي عليك دفعو: ' : 'المتبقي لك: '}
            <b>{total.toFixed(2)} د.ت</b>
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg self-start sm:self-auto">
          {showForm ? 'إلغاء' : '+ تسجيل دين'}
        </button>
      </div>

      {kinds.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap">
          {kinds.map((k) => (
            <button key={k} onClick={() => { setTab(k); setShowForm(false) }}
              className={`shrink-0 text-sm px-4 py-2 rounded-lg border ${tab === k ? 'bg-[#e4211b] text-white border-[#e4211b]' : 'border-[#e5e5e5]'}`}>
              {KINDS[k].label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="bg-[#fdeaea] text-[#b3170f] text-sm rounded-lg px-4 py-3 mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={addDebt} className="bg-white border border-[#e5e5e5] rounded-xl p-4 sm:p-6 mb-6 max-w-lg">
          <label className="block text-sm font-semibold mb-1.5">{KINDS[tab].party}</label>
          <input className={inp + ' mb-4'} value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} />
          <label className="block text-sm font-semibold mb-1.5">على شنو؟ (تصليح / إكسسوار / سلعة / سلفة...)</label>
          <input className={inp + ' mb-4'} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">المبلغ</label>
              <input type="number" step="0.001" className={inp} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">موعد الدفع (اختياري)</label>
              <input type="date" className={inp} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          {tab === 'money_lent' && (
            <label className="flex items-center gap-2 text-sm mb-3 bg-[#fff8f0] border border-[#f0d9b8] rounded-lg px-3 py-2">
              <input type="checkbox" checked={form.from_register}
                onChange={(e) => setForm({ ...form, from_register: e.target.checked })} />
              الفلوس خرجت من الصندوق (يتنقص من الصندوق توّا، ويرجع لما الشخص يرجّعها)
            </label>
          )}
          {tab === 'supplier_unpaid' && (
            <p className="text-xs text-[#6b6b6b] mb-3">
              تنبيه: لا تسجّل نفس الشراء في «المصاريف» كذلك، وإلا يتحسب مرتين. الدين هنا؛ لما تخلّص يتسجّل خروج من الصندوق (إذا اخترت).
            </p>
          )}
          <button className="w-full sm:w-auto bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg">حفظ</button>
        </form>
      )}

      <label className="text-xs text-[#6b6b6b] flex items-center gap-2 mb-3">
        <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} /> إظهار الديون المسدّدة
      </label>

      {loading ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        </div>
      ) : debts.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-xl">
          <p className="p-6 text-sm text-[#6b6b6b]">لا توجد ديون مفتوحة</p>
        </div>
      ) : (
        <>
          {/* Phone / tablet: one card per debt */}
          <div className="lg:hidden flex flex-col gap-3">
            {debts.map((d) => (
              <div key={d.id} className="bg-white border border-[#e5e5e5] rounded-xl p-4">
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a1a1a] text-sm">{d.party_name}</p>
                    {tab === 'money_lent' && (
                      <p className="text-[10px] text-[#6b6b6b]">{d.from_register ? 'من الصندوق' : 'من جيبك'}</p>
                    )}
                    <p className="text-xs text-[#6b6b6b] mt-0.5 break-words">{d.description}</p>
                  </div>
                  <StatusPill d={d} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-[#faf9f5] rounded-lg p-2.5 mb-3">
                  <div>
                    <p className="text-[#6b6b6b]">المبلغ</p>
                    <p className="font-semibold">{Number(d.amount).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#6b6b6b]">المدفوع</p>
                    <p className="font-semibold">{Number(d.paid_amount).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[#6b6b6b]">المتبقي</p>
                    <p className="font-bold">{remaining(d).toFixed(2)}</p>
                  </div>
                </div>
                <PaymentControl d={d} />
              </div>
            ))}
          </div>

          {/* Desktop: the original table */}
          <div className="hidden lg:block bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                  {['الاسم', 'على شنو', 'المبلغ', 'المدفوع', 'المتبقي', 'الحالة / موعد', ''].map((t) => (
                    <th key={t} className="text-right px-4 py-3 border-b border-[#e5e5e5]">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => (
                  <tr key={d.id} className="hover:bg-[#fbfaf6] align-top">
                    <td className="px-4 py-3.5 border-b border-[#ececE4] font-semibold">
                      {d.party_name}
                      {tab === 'money_lent' && (
                        <div className="text-[10px] text-[#6b6b6b] font-normal">{d.from_register ? 'من الصندوق' : 'من جيبك'}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4] text-xs">{d.description}</td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4]">{Number(d.amount).toFixed(2)}</td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4]">{Number(d.paid_amount).toFixed(2)}</td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4] font-bold">{remaining(d).toFixed(2)}</td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4]"><StatusPill d={d} /></td>
                    <td className="px-4 py-3.5 border-b border-[#ececE4]"><PaymentControl d={d} /></td>
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