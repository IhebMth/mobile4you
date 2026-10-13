import logo from '../../assets/logo.png'
import CornerTools from '../ui/CornerTools'

// Page frame shared by the login / forgot-password / reset-password screens.
// Mobile first: full-width card with comfortable padding, centered on bigger screens.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative min-h-screen bg-linear-to-b from-[#fbfaf6] to-[#f0efe9] flex flex-col items-center justify-center px-4 py-8">
      <CornerTools />
      <div className="w-full max-w-100">
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="Mobile 4 You" className="w-16 h-16 rounded-2xl object-cover shadow-sm ring-4 ring-white" />
          <p className="mt-3 text-[13px] font-extrabold tracking-[0.2em] text-[#1a1a1a]">MOBILE 4 YOU</p>
        </div>

        <div className="bg-white border border-[#e8e6df] rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <h1 className="text-xl font-extrabold text-[#1a1a1a]">{title}</h1>
          {subtitle && <p className="text-sm text-[#6b6b6b] mt-1.5 leading-relaxed">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-[#6b6b6b]">{footer}</div>}
      </div>
    </div>
  )
}
