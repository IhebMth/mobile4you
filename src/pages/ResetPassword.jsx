import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AuthShell from '../components/auth/AuthShell'
import PasswordField from '../components/auth/PasswordField'
import { t } from '../i18n/LanguageContext'

// The link in the email brings the person here with a temporary "recovery" session.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // expired / already used link → Supabase puts an error in the URL
    if (/error(_code)?=/.test(window.location.hash + window.location.search)) {
      setInvalid(true)
      return
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const giveUp = setTimeout(() => setReady((r) => { if (!r) setInvalid(true); return r }), 5000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(giveUp) }
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError(t('Le mot de passe doit contenir au moins 6 caractères')); return }
    if (password !== confirm) { setError(t('Les deux mots de passe ne correspondent pas')); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      const m = err.message || ''
      setError(m.includes('different from the old') ? t('Choisissez un mot de passe différent de l\'ancien') : t('Une erreur est survenue :') + ' ' + m)
      return
    }
    setDone(true)
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 2500)
  }

  if (done) {
    return (
      <AuthShell title={t('C\'est fait ✅')} subtitle={t('Votre nouveau mot de passe est enregistré. Nous vous redirigeons vers la connexion...')} footer={<Link to="/login" className="font-semibold text-[#e4211b]">{t('Entrer')}</Link>}>
        <div className="h-1.5 rounded-full bg-[#f0efe9] overflow-hidden"><div className="h-full w-full bg-[#e4211b] animate-pulse" /></div>
      </AuthShell>
    )
  }

  if (invalid && !ready) {
    return (
      <AuthShell
        title={t('Le lien n\'est plus valable')}
        subtitle={t('Le lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.')}
        footer={<Link to="/login" className="font-semibold text-[#e4211b]">{t('Retour à la connexion')}</Link>}
      >
        <Link to="/forgot-password" className="block w-full h-12 leading-[3rem] text-center bg-[#e4211b] text-white font-bold rounded-xl text-[15px]">{t('Demander un nouveau lien')}</Link>
      </AuthShell>
    )
  }

  if (!ready) {
    return <AuthShell title={t('Vérification du lien...')}><div className="h-1.5 rounded-full bg-[#f0efe9] overflow-hidden"><div className="h-full w-1/2 bg-[#e4211b] animate-pulse" /></div></AuthShell>
  }

  return (
    <AuthShell title={t('Nouveau mot de passe')} subtitle={t('Choisissez un nouveau mot de passe (6 caractères minimum).')}>
      <form onSubmit={handleSave}>
        <PasswordField label={t('Nouveau mot de passe')} value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField label={t('Saisissez-le à nouveau')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="text-[#b3170f] text-sm mb-4">{error}</p>}
        <button type="submit" disabled={saving} className="w-full h-12 bg-[#e4211b] text-white font-bold rounded-xl text-[15px] hover:opacity-90 disabled:opacity-60 active:scale-[0.99] transition">
          {saving ? t('Enregistrement...') : t('Enregistrer le mot de passe')}
        </button>
      </form>
    </AuthShell>
  )
}
