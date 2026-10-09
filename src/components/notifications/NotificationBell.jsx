import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '../../context/NotificationContext'
import { pushState, enablePush } from '../../lib/push'

const ICON = {
  new_order: '🆕', order_unassigned: '🆕', order_assigned: '🛠️', order_ready: '✅', order_cancelled: '❌',
  status_change: '🔄', price_set: '💰', client_ack: '🙋', low_stock: '📦', big_sale: '🛍️', cash_withdrawal: '💸',
  fidele: '⭐', fidele_order: '⭐', discount_applied: '🏷️', debt_added: '📒', debt_payment: '💵',
  debt_settled: '🎉', debt_due: '⏰', void_request: '↩️', void_result: '↩️', expense_added: '🧾',
  expense_result: '🧾', pending_digest: '📋', stuck_orders: '⏳', ready_waiting: '📞', daily_summary: '📊', test: '🔔',
}

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} س`
  return `منذ ${Math.floor(h / 24)} ي`
}

// onDark = white icon (used inside the dark phone header). Default = dark icon on light page.
export default function NotificationBell({ onDark = false }) {
  const { items, unread, markAll, go } = useNotifications()
  const [open, setOpen] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [ps, setPs] = useState(pushState())
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const shown = onlyUnread ? items.filter((i) => !i.is_read) : items

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [])

  async function turnOn() {
    setBusy(true)
    try { setPs(await enablePush()) } catch (e) { alert('تعذّر تفعيل الإشعارات: ' + e.message) }
    setBusy(false)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="الإشعارات"
        className={`relative p-2 rounded-lg ${onDark ? 'text-white' : 'text-[#1a1a1a] bg-white shadow border border-[#e5e5e5]'}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e4211b] text-white text-[11px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-2 right-2 top-14 lg:absolute lg:left-auto lg:right-0 lg:top-12 lg:w-[380px] bg-white text-[#1a1a1a] rounded-xl shadow-2xl border border-[#e5e5e5] z-50 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#eee]">
            <b className="text-sm">الإشعارات</b>
            <div className="flex items-center gap-3">
              <button onClick={() => setOnlyUnread(!onlyUnread)} className="text-xs font-semibold text-[#444]">
                {onlyUnread ? 'عرض الكل' : 'غير المقروءة فقط'}
              </button>
              {unread > 0 && <button onClick={markAll} className="text-xs text-[#b3170f] font-semibold">تعيين الكل كمقروء</button>}
            </div>
          </div>

          {ps === 'default' && (
            <button onClick={turnOn} disabled={busy}
              className="w-full text-start px-4 py-3 bg-[#fff8f0] text-[13px] font-semibold border-b border-[#f0d9b8]">
              🔔 {busy ? '...' : 'تفعيل إشعارات الهاتف (حتى لو الموقع مغلق)'}
            </button>
          )}
          {ps === 'ios-install' && (
            <p className="px-4 py-3 bg-[#fff8f0] text-[12.5px] border-b border-[#f0d9b8]">
              على iPhone: افتح الموقع في Safari ← زر المشاركة ← «أضف إلى الشاشة الرئيسية»، ثم افتح التطبيق من الأيقونة وفعّل الإشعارات.
            </p>
          )}
          {ps === 'denied' && (
            <p className="px-4 py-3 bg-[#fff3f3] text-[12.5px] border-b">الإشعارات محظورة — فعّلها من إعدادات المتصفح للموقع.</p>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-[#6b6b6b]">لا توجد إشعارات</p>}
            {shown.map((n) => (
              <button key={n.id} onClick={() => { setOpen(false); go(n) }}
                className={`w-full text-start px-4 py-3 border-b border-[#f1f1f1] ${n.is_read ? '' : 'bg-[#fff8f0]'}`}>
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#e4211b] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold">{ICON[n.type] || '🔔'} {n.title}</div>
                    <div className="text-[13px] text-[#444] break-words">{n.message}</div>
                    <div className="text-[11px] text-[#999] mt-1">{ago(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
