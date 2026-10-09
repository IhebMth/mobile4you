import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'
import { registerSW, syncPush } from '../lib/push'

// One live connection for the whole app: last 50 notifications + realtime inserts,
// toast + beep, tab-title counter, app-icon badge.
const Ctx = createContext(null)
export const useNotifications = () => useContext(Ctx)

function targetOf(n, role) {
  if (n.link_path) return n.link_path
  if (n.related_order_id) return role === 'technicien' ? `/technicien/order/${n.related_order_id}` : '/comptoir'
  return null
}

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)()
    const o = a.createOscillator()
    const g = a.createGain()
    o.connect(g); g.connect(a.destination); o.frequency.value = 880
    g.gain.setValueAtTime(0.08, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35)
    o.start(); o.stop(a.currentTime + 0.35)
  } catch (e) {}
}

export function NotificationProvider({ children }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*')
      .order('created_at', { ascending: false }).limit(50)
    setItems(data || [])
  }, [])

  useEffect(() => { registerSW() }, [])

  // tapping a phone notification while the app is already open
  useEffect(() => {
    if (!navigator.serviceWorker) return
    const onMsg = (e) => { if (e.data && e.data.type === 'navigate') navigate(e.data.url) }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [navigate])

  useEffect(() => {
    if (!user) { setItems([]); return }
    load()
    syncPush().catch(() => {})
    const ch = supabase.channel('notifs-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, ({ new: n }) => {
        setItems((p) => (p.some((x) => x.id === n.id) ? p : [n, ...p].slice(0, 50)))
        if (document.visibilityState === 'visible') {
          setToast(n); beep()
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setToast(null), 6000)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, ({ new: n }) =>
        setItems((p) => p.map((x) => (x.id === n.id ? { ...x, ...n } : x))))
      .subscribe()
    // the phone was asleep: catch up when the app comes back
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [user?.id, load])

  const unread = items.filter((i) => !i.is_read).length

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = unread ? `(${unread}) ${base}` : base
    if (navigator.setAppBadge) (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {})
  }, [unread])

  async function markRead(id) {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, is_read: true } : x)))
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }
  async function markAll() {
    setItems((p) => p.map((x) => ({ ...x, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
  }
  function go(n) {
    markRead(n.id); setToast(null)
    const t = targetOf(n, profile?.role)
    if (t) navigate(t)
  }

  return (
    <Ctx.Provider value={{ items, unread, markRead, markAll, go }}>
      {children}
      {toast && (
        <button onClick={() => go(toast)}
          className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[60] text-start bg-[#1a1a1a] text-white rounded-xl shadow-2xl px-4 py-3 border-s-4 border-[#e4211b]">
          <div className="text-sm font-bold">{toast.title}</div>
          <div className="text-[13px] opacity-80 mt-0.5">{toast.message}</div>
        </button>
      )}
    </Ctx.Provider>
  )
}
