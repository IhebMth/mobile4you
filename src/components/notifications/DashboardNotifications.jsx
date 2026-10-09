import { useNotifications } from '../../context/NotificationContext'

// Shown by ProtectedLayout at the top of the three dashboards (/comptoir, /technicien, /admin).
export default function DashboardNotifications() {
  const { items, unread, go, markAll } = useNotifications()
  const list = items.filter((i) => !i.is_read).slice(0, 5)
  if (!list.length) return null
  return (
    <div className="bg-white border border-[#f0d9b8] rounded-xl mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#fff8f0]">
        <b className="text-sm">🔔 جديد ({unread})</b>
        <button onClick={markAll} className="text-xs text-[#b3170f] font-semibold">تعيين الكل كمقروء</button>
      </div>
      {list.map((n) => (
        <button key={n.id} onClick={() => go(n)}
          className="w-full text-start px-4 py-2.5 border-t border-[#f3eadb] text-[13px]">
          <b>{n.title}</b> — <span className="text-[#555]">{n.message}</span>
        </button>
      ))}
      {unread > 5 && <p className="px-4 py-2 text-xs text-[#6b6b6b] border-t border-[#f3eadb]">+ {unread - 5} أخرى في الجرس</p>}
    </div>
  )
}
