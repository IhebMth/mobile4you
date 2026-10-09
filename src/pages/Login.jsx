import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/logo.png'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
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
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-6">
      <form onSubmit={handleLogin} className="bg-white border border-[#e5e5e5] rounded-2xl p-10 w-full max-w-sm shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Mobile 4 You" className="w-16 h-16 rounded-xl object-cover mb-3" />
          <h1 className="text-lg font-extrabold text-[#1a1a1a]">MOBILE 4 YOU</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">تسجيل الدخول</p>
        </div>

        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">البريد الإلكتروني</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm mb-4 focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
        />

        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">كلمة السر</label>
        <div className="relative mb-5">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 pl-10 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b6b6b] hover:text-[#1a1a1a]"
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        {error && <p className="text-[#b3170f] text-sm mb-4">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-[#e4211b] text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-60">
          {loading ? 'جاري الدخول...' : 'دخول'}
        </button>
      </form>
    </div>
  )
}