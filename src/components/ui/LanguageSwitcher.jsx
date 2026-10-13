import { useI18n } from '../../i18n/LanguageContext'

// Small "FR | EN" switch. The red thumb slides under the active language.
//   <LanguageSwitcher />          light backgrounds (desktop, login)
//   <LanguageSwitcher onDark />   dark backgrounds (the phone top bar)
const OPTIONS = [
  { code: 'fr', label: 'FR', full: 'Français' },
  { code: 'en', label: 'EN', full: 'English' },
]

export default function LanguageSwitcher({ onDark = false }) {
  const { lang, setLang } = useI18n()
  const index = Math.max(0, OPTIONS.findIndex((o) => o.code === lang))

  return (
    <div
      role="group"
      aria-label="Language / Langue"
      className={`relative inline-grid grid-cols-2 items-center h-9 p-[3px] rounded-full border select-none ${
        onDark
          ? 'bg-white/10 border-white/10'
          : 'bg-white border-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
      }`}
    >
      {/* sliding thumb */}
      <span
        aria-hidden="true"
        className="absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-[#e4211b] shadow-[0_2px_6px_rgba(228,33,27,0.35)] transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((o) => {
        const active = o.code === lang
        return (
          <button
            key={o.code}
            type="button"
            onClick={() => setLang(o.code)}
            aria-pressed={active}
            title={o.full}
            lang={o.code}
            className={`relative z-10 min-w-[38px] h-full px-2.5 rounded-full text-[12px] font-extrabold tracking-wide transition-colors ${
              active
                ? 'text-white'
                : onDark
                  ? 'text-[#c9c9c9] hover:text-white'
                  : 'text-[#6b6b6b] hover:text-[#1a1a1a]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
