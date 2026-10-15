import { useState } from 'react'
import { t } from '../../i18n/LanguageContext'

// Password input with a show/hide eye. text-base (16px) keeps iPhone from zooming in.
export default function PasswordField({ label, value, onChange, autoComplete = 'current-password', placeholder, hint, required = true }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          dir="ltr"
          className="w-full h-12 px-4 pe-12 border border-[#e2e0d8] rounded-xl text-base bg-[#fdfdfb] focus:outline-none focus:border-[#e4211b] focus:ring-4 focus:ring-[#e4211b]/10 transition"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? t('Masquer') : t('Afficher')}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-lg text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {hint && <p className="text-xs text-[#8a8a8a] mt-1.5">{hint}</p>}
    </div>
  )
}
