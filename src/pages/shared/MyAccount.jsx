import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PasswordField from '../../components/auth/PasswordField'
import { t } from '../../i18n/LanguageContext'

const ROLE_LABEL = { admin: 'Admin', super_admin: 'Super Admin', comptoir: 'Comptoir', technicien: 'Technicien' }
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Card({ icon, title, desc, children }) {
  return (
    <section className="bg-white border border-[#e8e6df] rounded-2xl p-5 sm:p-6 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-[#f4f2ec] flex items-center justify-center text-lg shrink-0">{icon}</span>
        <div>
          <h2 className="text-base font-extrabold text-[#1a1a1a]">{title}</h2>
          {desc && <p className="text-[13px] text-[#6b6b6b] mt-0.5 leading-relaxed">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Msg({ m }) {
  if (!m) return null
  const ok = m.type === 'ok'
  return (
    <p className={`text-sm rounded-xl px-3.5 py-2.5 mb-4 leading-relaxed ${ok ? 'bg-[#eaf7ee] text-[#17692f]' : 'bg-[#fdecea] text-[#b3170f]'}`}>{m.text}</p>
  )
}

// Verifies the current password without touching the open session's result for the UI.
async function checkPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return !error
}

export default function MyAccount() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState(user?.email || '')
  const [pendingEmail, setPendingEmail] = useState(user?.new_email || null)

  // password form
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwMsg, setPwMsg] = useState(null)
  const [pwBusy, setPwBusy] = useState(false)

  // email form
  const [newEmail, setNewEmail] = useState('')
  const [emPw, setEmPw] = useState('')
  const [emMsg, setEmMsg] = useState(null)
  const [emBusy, setEmBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) { setEmail(data.user.email || ''); setPendingEmail(data.user.new_email || null) }
    })
  }, [])

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 6) return setPwMsg({ type: 'err', text: t('Le nouveau mot de passe doit contenir au moins 6 caractères') })
    if (newPw !== newPw2) return setPwMsg({ type: 'err', text: t('Les deux nouveaux mots de passe ne correspondent pas') })
    if (newPw === curPw) return setPwMsg({ type: 'err', text: t('Choisissez un mot de passe différent de l\'actuel') })
    setPwBusy(true)
    if (!(await checkPassword(email, curPw))) {
      setPwBusy(false)
      return setPwMsg({ type: 'err', text: t('Le mot de passe actuel est incorrect') })
    }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwBusy(false)
    if (error) return setPwMsg({ type: 'err', text: t('Une erreur est survenue :') + ' ' + error.message })
    setCurPw(''); setNewPw(''); setNewPw2('')
    setPwMsg({ type: 'ok', text: t('Mot de passe modifié ✅') })
  }

  async function changeEmail(e) {
    e.preventDefault()
    setEmMsg(null)
    const clean = newEmail.trim().toLowerCase()
    if (!EMAIL_REGEX.test(clean)) return setEmMsg({ type: 'err', text: t('Format d\'e-mail incorrect') })
    if (clean === email.toLowerCase()) return setEmMsg({ type: 'err', text: t('C\'est déjà votre e-mail actuel') })
    setEmBusy(true)
    if (!(await checkPassword(email, emPw))) {
      setEmBusy(false)
      return setEmMsg({ type: 'err', text: t('Mot de passe incorrect') })
    }
    const { error } = await supabase.auth.updateUser({ email: clean }, { emailRedirectTo: `${window.location.origin}/account` })
    setEmBusy(false)
    if (error) {
      const m = error.message || ''
      return setEmMsg({ type: 'err', text: m.toLowerCase().includes('already') ? t('Cet e-mail est déjà utilisé par un autre compte') : t('Une erreur est survenue :') + ' ' + m })
    }
    setPendingEmail(clean)
    setNewEmail(''); setEmPw('')
    setEmMsg({ type: 'ok', text: t('Nous avons envoyé un lien de confirmation. Ouvrez-le (et si demandé, ouvrez aussi le lien reçu sur l\'ancien e-mail). L\'e-mail ne change qu\'après confirmation, et vous continuez à vous connecter avec l\'ancien d\'ici là.') })
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initial = (profile?.full_name || '?').trim().charAt(0).toUpperCase()
  const inputCls = 'w-full h-12 px-4 border border-[#e2e0d8] rounded-xl text-base bg-[#fdfdfb] focus:outline-none focus:border-[#e4211b] focus:ring-4 focus:ring-[#e4211b]/10 transition'
  const btnCls = 'w-full sm:w-auto h-12 px-7 bg-[#1a1a1a] text-white font-bold rounded-xl text-[15px] hover:opacity-90 disabled:opacity-60 active:scale-[0.99] transition'

  return (
    <div className="max-w-xl">
      {/* identity card */}
      <div className="bg-linear-to-br from-[#1f1f1f] to-[#2b2b2b] text-white rounded-2xl p-5 sm:p-6 mb-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#e4211b] text-2xl font-extrabold flex items-center justify-center shrink-0">{initial}</div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold truncate">{profile?.full_name || '—'}</p>
          <p className="text-[13px] text-[#c9c9c9] truncate" dir="ltr">{email}</p>
          <span className="inline-block mt-1.5 text-[11px] font-bold bg-white/10 rounded-full px-2.5 py-0.5">{ROLE_LABEL[profile?.role] || profile?.role}</span>
        </div>
      </div>

      <Card icon="🔑" title={t('Changer le mot de passe')} desc={t('Vous devez saisir votre mot de passe actuel pour confirmer.')}>
        <form onSubmit={changePassword}>
          <PasswordField label={t('Mot de passe actuel')} value={curPw} onChange={setCurPw} autoComplete="current-password" />
          <PasswordField label={t('Nouveau mot de passe')} value={newPw} onChange={setNewPw} autoComplete="new-password" hint={t('6 caractères minimum')} />
          <PasswordField label={t('Saisissez le nouveau à nouveau')} value={newPw2} onChange={setNewPw2} autoComplete="new-password" />
          <Msg m={pwMsg} />
          <button type="submit" disabled={pwBusy} className={btnCls}>{pwBusy ? t('Enregistrement...') : t('Changer le mot de passe')}</button>
        </form>
        <p className="text-xs text-[#8a8a8a] mt-4 leading-relaxed">{t('Mot de passe actuel oublié ? Appuyez sur « Se déconnecter » ci-dessous, puis sur la page de connexion choisissez « Mot de passe oublié ? ». Ou demandez à l\'administrateur de le changer pour vous.')}</p>
      </Card>

      <Card icon="✉️" title={t('Changer l\'e-mail')} desc={t('L\'e-mail est ce avec quoi vous vous connectez. Nous enverrons un lien de confirmation.')}>
        {pendingEmail && (
          <p className="text-[13px] bg-[#fff8e6] border border-[#f0d58a] text-[#8a6d1d] rounded-xl px-3.5 py-2.5 mb-4" dir="ltr">
            Waiting for confirmation: <b>{pendingEmail}</b>
          </p>
        )}
        <form onSubmit={changeEmail}>
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('Nouvel e-mail')}</label>
          <input type="email" dir="ltr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required className={`${inputCls} mb-4`} />
          <PasswordField label={t('Mot de passe (pour confirmer)')} value={emPw} onChange={setEmPw} autoComplete="current-password" />
          <Msg m={emMsg} />
          <button type="submit" disabled={emBusy} className={btnCls}>{emBusy ? t('Envoi en cours...') : t('Changer l\'e-mail')}</button>
        </form>
      </Card>

      <button onClick={handleLogout} className="w-full h-12 border border-[#e2e0d8] bg-white text-[#b3170f] font-bold rounded-xl text-[15px] hover:bg-[#fdecea] transition mb-6">
        
        {t('Se déconnecter')}
      </button>
    </div>
  )
}
