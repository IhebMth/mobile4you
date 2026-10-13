import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AuthShell from '../components/auth/AuthShell'
import { t } from '../i18n/LanguageContext'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [wait, setWait] = useState(0) // seconds before another email can be requested

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const clean = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(clean)) {
      setError(t('Format d\'e-mail incorrect (exemple : nom@exemple.com)'))
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)

    if (err) {
      const msg = err.message || ''
      if (err.status === 429 || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('seconds')) {
        setError(t('Vous avez fait une demande il y a un instant. Attendez une minute et réessayez.'))
        setWait(60)
      } else {
        setError(t('Une erreur est survenue :') + ' ' + msg)
      }
      return
    }
    // Same answer whether or not the email exists (so nobody can probe which emails have accounts).
    setSent(true)
    setWait(60)
  }

  if (sent) {
    return (
      <AuthShell
        title={t('Vérifiez votre e-mail 📬')}
        subtitle={t('Si {email} est enregistré chez nous, nous lui avons envoyé un lien pour choisir un nouveau mot de passe. Le lien est valable peu de temps.', { email: email.trim() })}
        footer={<Link to="/login" className="font-semibold text-[#e4211b]">{t('Retour à la connexion')}</Link>}
      >
        <ul className="text-sm text-[#555] space-y-2 mb-5 leading-relaxed">
          <li>{t('• Vous ne trouvez pas l\'e-mail ? Regardez dans Spam / Promotions.')}</li>
          <li>{t('• Ouvrez le lien depuis le même téléphone ou ordinateur que celui avec lequel vous voulez vous connecter.')}</li>
          <li>{t('• Pas d\'accès à votre e-mail ? Demandez à l\'administrateur de le changer pour vous.')}</li>
        </ul>
        <button
          type="button"
          disabled={wait > 0 || loading}
          onClick={handleSubmit}
          className="w-full h-12 rounded-xl border border-[#e2e0d8] text-sm font-semibold hover:bg-[#faf9f5] disabled:opacity-50"
        >
          {wait > 0 ? t('Renvoyer dans {wait} s', { wait }) : t('Renvoyer le lien')}
        </button>
        {error && <p className="text-[#b3170f] text-sm mt-3">{error}</p>}
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('Mot de passe oublié ?')}
      subtitle={t('Saisissez votre e-mail et nous vous enverrons un lien pour choisir un nouveau mot de passe.')}
      footer={<Link to="/login" className="font-semibold text-[#e4211b]">{t('Retour à la connexion')}</Link>}
    >
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('E-mail')}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          dir="ltr"
          required
          className="w-full h-12 px-4 border border-[#e2e0d8] rounded-xl text-base bg-[#fdfdfb] mb-4 focus:outline-none focus:border-[#e4211b] focus:ring-4 focus:ring-[#e4211b]/10 transition"
        />
        {error && <p className="text-[#b3170f] text-sm mb-4">{error}</p>}
        <button
          type="submit"
          disabled={loading || wait > 0}
          className="w-full h-12 bg-[#e4211b] text-white font-bold rounded-xl text-[15px] hover:opacity-90 disabled:opacity-60 active:scale-[0.99] transition"
        >
          {loading ? t('Envoi en cours...') : wait > 0 ? t('Attendez {wait} s', { wait }) : t('Envoyer le lien')}
        </button>
      </form>
    </AuthShell>
  )
}
