import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/logo.png'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Remembers the last email used (never the password — that is the phone's password manager's job).
// Also works as a test: if the app asks you to log in again but the email is already filled,
// the phone kept its data and only the login expired; if the email is empty too, the phone
// or browser wiped this site's data when the app was closed.
const LAST_EMAIL_KEY = 'm4u-last-email'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('صيغة البريد الإلكتروني غير صحيحة (مثال: name@example.com)')
      return
    }
    if (password.length < 6) {
      setError('كلمة السر لازم تكون 6 خانات على الأقل')
      return
    }

    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setLoading(false)
      const msg = authError.message || ''
      if (msg.includes('Invalid login credentials')) {
        setError('البريد الإلكتروني أو كلمة السر غير صحيحة')
      } else if (msg.includes('Email not confirmed')) {
        setError('الحساب ما تأكدش بعد عبر البريد الإلكتروني')
      } else if (msg.includes('Too many requests') || msg.includes('rate limit')) {
        setError('محاولات كثيرة، انتظر شوية وعاود جرب')
      } else if (msg.includes('fetch') || msg.includes('network')) {
        setError('مشكلة في الاتصال بالإنترنت، تأكد من الشبكة')
      } else {
        setError('خطأ في تسجيل الدخول: ' + msg)
      }
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    setLoading(false)

    if (profileError || !profile) {
      setError('تم الدخول لكن ما لقيناش الحساب في profiles. تواصل مع الأدمن.')
      return
    }

    try { localStorage.setItem(LAST_EMAIL_KEY, email.trim()) } catch { /* storage blocked: ignore */ }

    // Came here from a protected page (e.g. scanning a device sticker)? Go back to it.
    // Only same-site paths are accepted, so a crafted ?next=https://evil.com is ignored.
    const next = searchParams.get('next')
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')) {
      navigate(next, { replace: true })
      return
    }

    if (profile.role === 'admin' || profile.role === 'super_admin') navigate('/admin')
    else if (profile.role === 'comptoir') navigate('/comptoir')
    else if (profile.role === 'technicien') navigate('/technicien')
    else setError('دور غير معروف: ' + profile.role)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fbfaf6] to-[#f0efe9] flex items-center justify-center px-4 py-8">
      <form onSubmit={handleLogin} className="bg-white border border-[#e8e6df] rounded-3xl p-6 sm:p-9 w-full max-w-[400px] shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Mobile 4 You" className="w-16 h-16 rounded-2xl object-cover mb-3 ring-4 ring-[#f4f2ec]" />
          <h1 className="text-lg font-extrabold text-[#1a1a1a]">MOBILE 4 YOU</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">تسجيل الدخول</p>
        </div>

        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">البريد الإلكتروني</label>
        <input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full h-12 px-4 border border-[#e2e0d8] rounded-xl text-base mb-4 focus:outline-none focus:border-[#e4211b] focus:ring-4 focus:ring-[#e4211b]/10 bg-[#fdfdfb] transition"
        />

        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">كلمة السر</label>
        <div className="relative mb-2">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-12 px-4 pl-12 border border-[#e2e0d8] rounded-xl text-base focus:outline-none focus:border-[#e4211b] focus:ring-4 focus:ring-[#e4211b]/10 bg-[#fdfdfb] transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#6b6b6b] hover:text-[#1a1a1a]"
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        <div className="mb-5">
          <Link to="/forgot-password" className="text-[13px] font-semibold text-[#e4211b] hover:underline">نسيت كلمة السر؟</Link>
        </div>

        {error && <p className="text-[#b3170f] text-sm mb-4">{error}</p>}

        <button type="submit" disabled={loading} className="w-full h-12 bg-[#e4211b] text-white font-bold rounded-xl text-[15px] hover:opacity-90 disabled:opacity-60 active:scale-[0.99] transition">
          {loading ? 'جاري الدخول...' : 'دخول'}
        </button>
      </form>
    </div>
  )
}