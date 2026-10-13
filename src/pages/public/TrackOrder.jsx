import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { SHOP } from '../../lib/shopConfig'
import { t, getLocale } from '../../i18n/LanguageContext'

// Public page (no login). Opened by the client scanning the QR on the receipt.
// Reads ONLY through the track_order() / acknowledge_order() SQL functions
// (Script M: discount %, warranty countdown, link closes 48h after delivery).
const STEPS = [
  { key: 'received',  label: t('Appareil reçu'), icon: '📥' },
  { key: 'diagnosing', label: t('En cours d\'examen'),        icon: '🔍' },
  { key: 'in_repair', label: t('En réparation'),      icon: '🔧' },
  { key: 'ready',     label: t('Prêt à récupérer'),    icon: '✅' },
  { key: 'delivered', label: t('Livré'),       icon: '🤝' },
]

// the client picks the DAY and the TIME he will come
const ETA_DAYS = [
  { label: t('Aujourd\'hui'), add: 0 },
  { label: t('Demain'), add: 1 },
  { label: t('Après-demain'), add: 2 },
]
const pad = (n) => String(n).padStart(2, '0')
function defaultTime() {
  const d = new Date(Date.now() + 3600 * 1000) // next hour
  return `${pad(d.getHours())}:00`
}

// live countdown to the end of the 48h return window
function Countdown({ until, onEnd }) {
  const [left, setLeft] = useState(() => until - Date.now())
  useEffect(() => {
    const t = setInterval(() => {
      const l = until - Date.now()
      setLeft(l)
      if (l <= 0) { clearInterval(t); onEnd() }
    }, 1000)
    return () => clearInterval(t)
  }, [until])
  const s = Math.max(0, Math.floor(left / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return (
    <p className="text-2xl font-extrabold tracking-wider my-2" dir="ltr">{pad(h)}:{pad(m)}:{pad(sec)}</p>
  )
}

export default function TrackOrder() {
  const { access_token } = useParams()
  const [order, setOrder] = useState(undefined) // undefined = loading, null = not found
  const [eta, setEta] = useState(0)
  const [etaTime, setEtaTime] = useState(defaultTime)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    const { data, error: e } = await supabase.rpc('track_order', { p_token: access_token })
    if (e) { setError(e.message); setOrder(null); return }
    setOrder(data)
  }
  useEffect(() => { load() }, [access_token])

  async function acknowledge() {
    setSending(true)
    const [hh, mm] = (etaTime || '12:00').split(':').map(Number)
    const d = new Date()
    d.setDate(d.getDate() + ETA_DAYS[eta].add)
    d.setHours(hh, mm, 0, 0)
    if (d.getTime() < Date.now()) { setSending(false); setError(t('L\'heure choisie est déjà passée, choisissez une autre heure')); return }
    const when = d.toISOString()
    const { error: e } = await supabase.rpc('acknowledge_order', { p_token: access_token, p_eta: when })
    setSending(false)
    if (e) { setError(e.message); return }
    load()
  }

  const shell = (children) => (
    <div dir="ltr" className="min-h-screen bg-[#faf9f5] flex justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <p className="text-center text-sm font-extrabold tracking-wide text-[#e4211b] mb-5">{SHOP.name}</p>
        {children}
      </div>
    </div>
  )

  if (order && order.closed)
    return shell(
      <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 text-center">
        <p className="text-3xl mb-2">🔒</p>
        <p className="font-bold mb-1">{t('Ce lien a expiré')}</p>
        <p className="text-sm text-[#6b6b6b]">{t('48 heures se sont écoulées depuis la remise de l\'appareil. Pour toute question, contactez la boutique.')}</p>
        {SHOP.phone && <p className="text-sm mt-3" dir="ltr">{SHOP.phone}</p>}
      </div>
    )
  if (order === undefined) return shell(<p className="text-center text-sm text-[#6b6b6b]">{t('Chargement...')}</p>)
  if (order === null)
    return shell(
      <div className="bg-white border border-[#e5e5e5] rounded-2xl p-8 text-center">
        <p className="text-3xl mb-2">🔎</p>
        <p className="font-bold mb-1">{t('Commande introuvable')}</p>
        <p className="text-sm text-[#6b6b6b]">{t('Vérifiez le code ou contactez la boutique.')}</p>
        {error && <p className="text-xs text-[#b3170f] mt-3" dir="ltr">{error}</p>}
      </div>
    )

  const cancelled = order.status === 'cancelled'
  const current = STEPS.findIndex((s) => s.key === order.status)
  // Final price only (set by the technician). The estimate lives on the paper receipt, not here.
  const total = order.total != null ? Number(order.total) : null
  const remaining = order.remaining != null ? Number(order.remaining) : 0
  const fmt = (n) => t('{n} DT', { n: Number(n).toFixed(2).replace(/\.00$/, '') })

  return shell(
    <>
      <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5 mb-4 text-center">
        {order.first_name && <p className="text-sm text-[#6b6b6b] mb-1">{t('Bonjour')} {order.first_name} 👋</p>}
        <p className="font-extrabold text-lg">{order.device_model}</p>
        <p className="text-xs text-[#6b6b6b] mt-1" dir="ltr">{order.order_number}</p>
      </div>

      {cancelled ? (
        <div className="bg-[#fdeaea] text-[#b3170f] rounded-2xl p-5 text-center font-semibold mb-4">{t('Cette commande a été annulée')}</div>
      ) : (
        <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5 mb-4">
          {STEPS.map((s, i) => {
            const done = i < current, now = i === current
            return (
              <div key={s.key} className="flex items-center gap-3 py-2">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0
                  ${now ? 'bg-[#e4211b] text-white ring-4 ring-[#e4211b]/15' : done ? 'bg-[#e8f6ee]' : 'bg-[#f3f1ea] opacity-60'}`}>
                  {done ? '✓' : s.icon}
                </span>
                <span className={`text-sm ${now ? 'font-extrabold text-[#1a1a1a]' : done ? 'text-[#1f8a4c]' : 'text-[#9a9a9a]'}`}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* fidele discount (Phase 5): visible as soon as the comptoir/technicien applied it */}
      {Number(order.discount_percent) > 0 && !cancelled && (
        <div className="bg-[#fff8e1] border border-[#e4b73b] text-[#8a6a1f] rounded-2xl p-3 mb-4 text-sm text-center font-semibold">
          {t('⭐ Remise client fidèle {percent}% appliquée', { percent: Number(order.discount_percent) })}
          {total != null ? <>  {t('— vous avez économisé')} {fmt(order.discount)}</> : <>  {t('— affiché avec le prix final')}</>}
        </div>
      )}

      {/* return window after delivery: live countdown, the whole link closes when it reaches 0 */}
      {order.status === 'delivered' && order.claim_deadline && (
        <div className="rounded-2xl p-4 mb-4 text-sm text-center font-semibold bg-[#e8f6ee] text-[#1f8a4c]">
          <p>{t('🛡️ Merci de votre confiance ! Si un problème apparaît sur votre téléphone, vous pouvez le ramener pendant ce délai :')}</p>
          <Countdown until={new Date(order.claim_deadline).getTime()} onEnd={load} />
          <p className="text-xs font-normal">{t('Garantie {hours} h — après cela ce lien se ferme.', { hours: order.claim_window_hours || 48 })}</p>
        </div>
      )}

      {/* price + payment */}
      {total != null ? (
        <div className="bg-white border border-[#e5e5e5] rounded-2xl p-5 mb-4">
          {Number(order.discount) > 0 && (
            <div className="flex justify-between text-sm text-[#6b6b6b] mb-2">
              <span>{t('Prix avant remise')}</span>
              <span className="line-through">{fmt(order.final_price)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#6b6b6b]">{t('Prix final')}</span>
            <span className="font-extrabold text-lg text-[#1f8a4c]">{fmt(total)}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#f0f0ea] text-sm">
            {order.payment === 'paid' && (
              <p className="font-bold text-[#1f8a4c]">{t('✅ Payé — merci de votre confiance')}</p>
            )}
            {order.payment === 'partial' && (
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-[#6b6b6b]">{t('Payé')}</span><b>{fmt(total - remaining)}</b></div>
                <div className="flex justify-between"><span className="text-[#6b6b6b]">{t('Reste')}</span><b className="text-[#b36b00]">{fmt(remaining)}</b></div>
              </div>
            )}
            {order.payment === 'pending' && (
              <p className="text-[#6b6b6b]">{t('💳 Paiement à la remise de l\'appareil')}</p>
            )}
          </div>
        </div>
      ) : (
        !cancelled && (
          <div className="bg-[#fffaf0] border border-[#f1e3bf] rounded-2xl p-4 mb-4 text-sm text-[#8a6a1f] text-center">
            
            {t('💲 Le prix final s\'affichera ici après la confirmation du technicien')}
          </div>
        )
      )}

      {order.status === 'ready' && !order.client_acknowledged && (
        <div className="bg-white border-2 border-[#e4211b] rounded-2xl p-5 mb-4">
          <p className="font-bold text-sm mb-3">{t('Votre appareil est prêt ! Quand venez-vous le récupérer ?')}</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {ETA_DAYS.map((o, i) => (
              <button key={o.label} onClick={() => setEta(i)}
                className={`text-xs font-semibold py-2.5 rounded-lg border ${eta === i ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'border-[#e5e5e5] text-[#6b6b6b]'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm mb-3">
            <span className="text-[#6b6b6b]">{t('Heure')}</span>
            <input type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)}
              className="px-3 py-2 border border-[#e5e5e5] rounded-lg text-sm" dir="ltr" />
          </label>
          <button onClick={acknowledge} disabled={sending}
            className="w-full bg-[#e4211b] text-white font-semibold text-sm py-3 rounded-lg disabled:opacity-60">
            {sending ? '...' : t('Confirmer')}
          </button>
        </div>
      )}
      {order.status === 'ready' && order.client_acknowledged && (
        <p className="bg-[#e8f6ee] text-[#1f8a4c] text-sm font-semibold rounded-2xl p-4 text-center mb-4">
          
          {t('Confirmation reçue, nous vous attendons 🙌')}
          {order.client_pickup_eta && (
            <span className="block text-xs font-normal mt-1">
              {new Date(order.client_pickup_eta).toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' })} — {t('à l\'heure')}{' '}
              {new Date(order.client_pickup_eta).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
      )}
      {error && <p className="text-xs text-[#b3170f] text-center" dir="ltr">{error}</p>}
      {SHOP.phone && <p className="text-center text-xs text-[#6b6b6b] mt-4">{t('Pour toute question :')} <span dir="ltr">{SHOP.phone}</span></p>}
    </>
  )
}
