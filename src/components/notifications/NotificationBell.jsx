import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications } from '../../context/NotificationContext'
import { pushState, enablePush } from '../../lib/push'

// type -> emoji
const ICON = {
  new_order: '🆕', order_unassigned: '🆕', order_assigned: '🛠️', order_ready: '✅', order_cancelled: '❌',
  status_change: '🔄', price_set: '💰', client_ack: '🙋', low_stock: '📦', big_sale: '🛍️', cash_withdrawal: '💸',
  fidele: '⭐', fidele_order: '⭐', discount_applied: '🏷️', debt_added: '📒', debt_payment: '💵',
  debt_settled: '🎉', debt_due: '⏰', void_request: '↩️', void_result: '↩️', expense_added: '🧾',
  expense_result: '🧾', pending_digest: '📋', stuck_orders: '⏳', ready_waiting: '📞', daily_summary: '📊', test: '🔔',
}

// type -> colour family of the little tile (orders blue, money green, stock amber, debts purple, fidele gold, other grey)
const TONE = {
  orders: 'bg-[#e8f0ff]', money: 'bg-[#e6f6ec]', stock: 'bg-[#fff1da]', debts: 'bg-[#f1e9ff]', fidele: 'bg-[#fff6cc]', other: 'bg-[#f1f0ec]',
}
const GROUP = {
  new_order: 'orders', order_unassigned: 'orders', order_assigned: 'orders', order_ready: 'orders', order_cancelled: 'orders',
  status_change: 'orders', client_ack: 'orders', stuck_orders: 'orders', ready_waiting: 'orders',
  price_set: 'money', big_sale: 'money', cash_withdrawal: 'money', expense_added: 'money', expense_result: 'money',
  low_stock: 'stock',
  debt_added: 'debts', debt_payment: 'debts', debt_settled: 'debts', debt_due: 'debts',
  fidele: 'fidele', fidele_order: 'fidele', discount_applied: 'fidele',
}

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} س`
  return `منذ ${Math.floor(h / 24)} ي`
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'اليوم'
  if (d.toDateString() === yest.toDateString()) return 'أمس'
  return 'أقدم'
}

const RING_CSS = `
@keyframes m4u-ring{0%,100%{transform:rotate(0)}12%{transform:rotate(14deg)}24%{transform:rotate(-12deg)}36%{transform:rotate(9deg)}48%{transform:rotate(-6deg)}60%{transform:rotate(3deg)}}
.m4u-ring{transform-origin:50% 8%;animation:m4u-ring 1.6s ease-in-out 1}`

function BellIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.22 : 0}
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  )
}

// onDark = bell inside the dark phone header. Default = bell on the light page (desktop).
export default function NotificationBell({ onDark = false }) {
  const { items, unread, markAll, go } = useNotifications()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('all') // 'all' | 'unread'
  const [ps, setPs] = useState(pushState())
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)

  const shown = tab === 'unread' ? items.filter((i) => !i.is_read) : items

  // where the panel goes: full width under the header on phones, a 400px card under the bell on desktop
  function place() {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    if (window.innerWidth < 1024) setPos({ left: 8, right: 8, top: r.bottom + 8 })
    else setPos({ width: 400, left: Math.max(8, Math.min(r.right - 400, window.innerWidth - 408)), top: r.bottom + 10 })
  }

  useLayoutEffect(() => { if (open) place() }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onResize = () => place()
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    const prev = document.body.style.overflow
    if (window.innerWidth < 1024) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.body.style.overflow = prev
    }
  }, [open])

  async function turnOn() {
    setBusy(true)
    try {
      setPs(await enablePush())
    } catch (e) {
      const brave = /push service|registration failed/i.test(e.message || '')
        ? '\n\nإذا كنت على Brave بالهاتف: قد لا يدعم هذه الميزة — جرّب Chrome.'
        : ''
      alert('تعذّر تفعيل الإشعارات: ' + e.message + brave)
    }
    setBusy(false)
  }

  // group by day, keep the order
  const groups = []
  for (const n of shown) {
    const label = dayLabel(n.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.list.push(n)
    else groups.push({ label, list: [n] })
  }

  return (
    <>
      <style>{RING_CSS}</style>
      <button
        ref={btn}
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-expanded={open}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition active:scale-95 ${
          onDark
            ? 'text-white bg-white/10 hover:bg-white/20'
            : 'text-[#1a1a1a] bg-white border border-[#e5e5e5] shadow-sm hover:bg-[#faf9f5]'
        }`}
      >
        <span key={unread} className={unread > 0 ? 'm4u-ring inline-flex' : 'inline-flex'}>
          <BellIcon filled={unread > 0} />
        </span>
        {unread > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-[#e4211b] text-white text-[11px] font-extrabold leading-none flex items-center justify-center ring-2 ${onDark ? 'ring-[#1a1a1a]' : 'ring-white'}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div className="fixed inset-0 z-[70]" dir="rtl">
          {/* dim on phones, invisible click-catcher on desktop */}
          <div className="absolute inset-0 bg-black/35 lg:bg-transparent" onClick={() => setOpen(false)} />

          <div
            role="dialog"
            aria-label="الإشعارات"
            style={pos}
            className="absolute flex flex-col bg-white rounded-2xl border border-[#ece9e0] shadow-[0_24px_70px_rgba(0,0,0,0.28)] overflow-hidden max-h-[min(78vh,640px)]"
          >
            {/* header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-extrabold text-[#1a1a1a]">الإشعارات</h2>
                {unread > 0 && <span className="text-[11px] font-bold bg-[#e4211b] text-white rounded-full px-2 py-0.5">{unread} جديد</span>}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={markAll} className="text-[12px] font-bold text-[#b3170f] px-2.5 py-1.5 rounded-lg hover:bg-[#fdeeee]">
                    ✓ قراءة الكل
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="إغلاق" className="w-8 h-8 rounded-full text-[#6b6b6b] text-xl leading-none hover:bg-[#f1f0ec]">×</button>
              </div>
            </div>

            {/* tabs */}
            <div className="px-4 pb-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#f3f1ea] text-[13px] font-bold">
                {[['all', `الكل (${items.length})`], ['unread', `غير المقروءة (${unread})`]].map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`py-2 rounded-lg transition ${tab === k ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#7a7a7a]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* phone push status */}
            {ps === 'default' && (
              <div className="mx-4 mb-3 rounded-xl bg-gradient-to-l from-[#e4211b] to-[#b3170f] text-white p-3.5 flex items-center gap-3">
                <span className="text-2xl">🔔</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-extrabold">فعّل إشعارات الهاتف</p>
                  <p className="text-[11.5px] opacity-90 leading-snug">باش توصلك الإشعارات حتى لو الموقع مسكّر</p>
                </div>
                <button onClick={turnOn} disabled={busy} className="shrink-0 bg-white text-[#b3170f] text-[12.5px] font-extrabold rounded-lg px-3.5 py-2 active:scale-95 disabled:opacity-60">
                  {busy ? '...' : 'تفعيل'}
                </button>
              </div>
            )}
            {ps === 'granted' && (
              <p className="mx-4 mb-3 text-[12px] font-semibold text-[#17692f] bg-[#eaf7ee] rounded-lg px-3 py-2">✅ إشعارات الهاتف مفعّلة على هذا الجهاز</p>
            )}
            {ps === 'ios-install' && (
              <p className="mx-4 mb-3 text-[12px] leading-relaxed bg-[#fff8e6] border border-[#f0d58a] text-[#8a6d1d] rounded-lg px-3 py-2">
                على iPhone: افتح الموقع في Safari ← زر المشاركة ← «أضف إلى الشاشة الرئيسية»، ثم افتح التطبيق من الأيقونة وفعّل الإشعارات.
              </p>
            )}
            {ps === 'denied' && (
              <p className="mx-4 mb-3 text-[12px] bg-[#fdecea] text-[#b3170f] rounded-lg px-3 py-2">الإشعارات محظورة — فعّلها من إعدادات المتصفح للموقع (القفل بجانب العنوان).</p>
            )}
            {ps === 'unsupported' && (
              <p className="mx-4 mb-3 text-[12px] bg-[#f1f0ec] text-[#6b6b6b] rounded-lg px-3 py-2">إشعارات خارج الموقع تحتاج رابط https ومتصفح يدعمها.</p>
            )}

            {/* list */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {shown.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-[#f3f1ea] flex items-center justify-center text-2xl mb-3">🔕</div>
                  <p className="text-sm font-bold text-[#444]">{tab === 'unread' ? 'كل شيء مقروء' : 'لا توجد إشعارات'}</p>
                  <p className="text-xs text-[#9a9a9a] mt-1">الجديد يظهر هنا مباشرة</p>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="sticky top-0 bg-[#faf9f5] px-4 py-1.5 text-[11px] font-bold text-[#8a8a8a] border-y border-[#f0eee6]">{g.label}</p>
                  {g.list.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { setOpen(false); go(n) }}
                      className={`w-full flex items-start gap-3 text-right px-4 py-3 border-b border-[#f4f2ec] transition hover:bg-[#faf9f5] active:bg-[#f4f2ec] ${n.is_read ? '' : 'bg-[#fff7f2]'}`}
                    >
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0 ${TONE[GROUP[n.type] || 'other']}`}>
                        {ICON[n.type] || '🔔'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-[13.5px] leading-snug ${n.is_read ? 'font-semibold text-[#3a3a3a]' : 'font-extrabold text-[#111]'}`}>{n.title}</span>
                          <span className="text-[11px] text-[#9a9a9a] whitespace-nowrap mt-0.5">{ago(n.created_at)}</span>
                        </span>
                        <span className="block text-[12.5px] text-[#666] mt-0.5 leading-snug line-clamp-2 break-words">{n.message}</span>
                      </span>
                      {!n.is_read && <span className="w-2.5 h-2.5 rounded-full bg-[#e4211b] mt-1.5 shrink-0" aria-label="جديد" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
