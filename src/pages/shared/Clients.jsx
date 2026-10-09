import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const STATUS = { received: 'مستلم', diagnosing: 'قيد الفحص', in_repair: 'قيد الإصلاح', ready: 'جاهز', delivered: 'تم التسليم', cancelled: 'ملغى' }
const money = (n) => Number(n || 0).toFixed(2).replace(/\.00$/, '') + ' د.ت'

// Clients list for comptoir + admin: visits, everything fixed before, fidele on/off and the %.
export default function Clients() {
  const [clients, setClients] = useState([])
  const [cfg, setCfg] = useState({ th: 3, pct: 10 })
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [hist, setHist] = useState({})
  const [pct, setPct] = useState({})
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('clients')
      .select('id, full_name, phone, is_fidele, fidele_set_manually, fidele_percent, visits_count')
      .order('visits_count', { ascending: false }).limit(500)
    setClients(data || [])
  }, [])

  useEffect(() => {
    let active = true

    const hydrate = async () => {
      await load()

      const { data } = await supabase.from('app_settings')
        .select('key, value')
        .in('key', ['fidele_threshold', 'fidele_percent'])

      if (!active) return

      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]))
      setCfg({ th: Number(m.fidele_threshold) || 3, pct: Number(m.fidele_percent) || 10 })
    }

    void hydrate()

    return () => {
      active = false
    }
  }, [load])

  async function toggle(c) {
    if (open === c.id) return setOpen(null)
    setOpen(c.id)
    if (!hist[c.id]) {
      const { data } = await supabase.from('repair_orders')
        .select('id, order_number, device_model, issue_description, status, final_price, discount, discount_percent, created_at')
        .eq('client_id', c.id).order('created_at', { ascending: false })
      setHist((h) => ({ ...h, [c.id]: data || [] }))
    }
  }

  async function act(c, mode, percent) {
    const { error } = await supabase.rpc('set_client_fidele', { p_client: c.id, p_mode: mode, p_percent: percent ?? null })
    setMsg(error ? error.message : 'تم الحفظ ✓')
    load()
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? clients.filter((c) => c.full_name.toLowerCase().includes(s) || c.phone.includes(s)) : clients
  }, [clients, q])

  return (
    <div>
      <div className="mb-5 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">العملاء</h1>
        <p className="text-sm text-[#6b6b6b]">
          يصبح العميل فيديل تلقائياً بعد {cfg.th} زيارات بتخفيض {cfg.pct}% — ويمكنك تغييره يدوياً.
        </p>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف"
        className="w-full max-w-md px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm mb-4" />
      {msg && <p className="text-xs text-[#1f8a4c] mb-3">{msg}</p>}

      <div className="space-y-2">
        {shown.map((c) => {
          const h = hist[c.id] || []
          const spent = h.filter((o) => o.status === 'delivered')
            .reduce((s, o) => s + Number(o.final_price || 0) - Number(o.discount || 0), 0)
          return (
            <div key={c.id} className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
              <button onClick={() => toggle(c)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{c.is_fidele && '⭐ '}{c.full_name}</div>
                  <div className="text-xs text-[#6b6b6b]" dir="ltr">{c.phone}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.is_fidele && <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-[#fff4d6] text-[#8a6a1f]">فيديل {Number(c.fidele_percent)}%</span>}
                  <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-[#eaf1fe] text-[#2f6fed]">{c.visits_count} زيارة</span>
                </div>
              </button>

              {open === c.id && (
                <div className="px-4 pb-4 border-t border-[#f1f1f1]">
                  <div className="bg-[#faf9f5] rounded-lg p-3 mt-3 text-sm">
                    <div className="font-bold mb-2">
                      {c.is_fidele ? `⭐ عميل فيديل — ${Number(c.fidele_percent)}%` : 'عميل عادي'}
                      <span className="text-xs font-normal text-[#6b6b6b]"> ({c.fidele_set_manually ? 'يدوي' : 'تلقائي'})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!c.is_fidele && <button onClick={() => act(c, 'fidele', cfg.pct)} className="px-3 py-1.5 rounded-lg bg-[#1f8a4c] text-white text-xs font-semibold">اعتباره فيديل</button>}
                      {c.is_fidele && <button onClick={() => act(c, 'normal')} className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white text-xs font-semibold">إلغاء الفيديل</button>}
                      {c.fidele_set_manually && <button onClick={() => act(c, 'auto')} className="px-3 py-1.5 rounded-lg border text-xs font-semibold">رجوع للتلقائي</button>}
                      {c.is_fidele && (
                        <>
                          <input type="number" min="0" max="100" value={pct[c.id] ?? c.fidele_percent}
                            onChange={(e) => setPct({ ...pct, [c.id]: e.target.value })}
                            className="w-20 px-2 py-1.5 border rounded-lg text-xs" />
                          <span className="text-xs">%</span>
                          <button onClick={() => act(c, 'percent', Number(pct[c.id] ?? c.fidele_percent))} className="px-3 py-1.5 rounded-lg border text-xs font-semibold">حفظ النسبة</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-[#6b6b6b] mt-3 mb-2">
                    <span>الزيارات: <b className="text-[#1a1a1a]">{c.visits_count}</b></span>
                    <span>مجموع ما دفعه: <b className="text-[#1a1a1a]">{money(spent)}</b></span>
                  </div>
                  <h4 className="text-xs font-bold text-[#e4211b] mb-1.5">ما أصلحه سابقاً</h4>
                  {h.length === 0 && <p className="text-xs text-[#6b6b6b]">لا يوجد سجل.</p>}
                  {h.map((o) => (
                    <div key={o.id} className="py-2 border-t border-[#f3f3ee] text-[13px]">
                      <div className="flex justify-between gap-2">
                        <b>{o.device_model}</b>
                        <span className="text-xs text-[#6b6b6b]">{new Date(o.created_at).toLocaleDateString('fr-TN')}</span>
                      </div>
                      <div className="text-[#555]">{o.issue_description}</div>
                      <div className="text-xs text-[#6b6b6b] mt-0.5">
                        {o.order_number} · {STATUS[o.status] || o.status}
                        {o.final_price != null && ` · ${money(Number(o.final_price) - Number(o.discount || 0))}`}
                        {Number(o.discount_percent) > 0 && ` (تخفيض ${Number(o.discount_percent)}%)`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {shown.length === 0 && <p className="text-sm text-[#6b6b6b]">لا يوجد عملاء.</p>}
      </div>
    </div>
  )
}
