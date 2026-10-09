import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import logo from '../../assets/logo.png'

// Items are grouped; a group with a `title` shows a small section label on desktop.
const NAV_BY_ROLE = {
  comptoir: [
    { title: 'العمل اليومي', items: [
      { to: '/comptoir', label: 'الطلبات', icon: '📋' },
      { to: '/comptoir/new-order', label: 'استقبال جهاز جديد', icon: '📱' },
      { to: '/comptoir/sell', label: 'بيع إكسسوار', icon: '🛍️' },
      { to: '/comptoir/clients', label: 'العملاء', icon: '⭐' },
    ] },
    { title: 'المال', items: [
      { to: '/caisse', label: 'الصندوق', icon: '💰' },
      { to: '/comptoir/debts', label: 'ديون الحرفاء', icon: '🧾' },
      { to: '/comptoir/expenses', label: 'مصاريف قطع الغيار', icon: '🔧' },
      { to: '/comptoir/general-expenses', label: 'مصاريف عامة', icon: '💵' },
    ] },
    { title: 'أدوات', items: [
      { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
    ] },
  ],
  technicien: [
    { title: 'العمل', items: [
      { to: '/technicien', label: 'أجهزتي', icon: '🔧' },
    ] },
    { title: 'المصاريف', items: [
      { to: '/technicien/expenses', label: 'مصاريف قطع الغيار', icon: '🛠️' },
      { to: '/technicien/general-expenses', label: 'مصاريف عامة', icon: '💵' },
    ] },
    { title: 'أدوات', items: [
      { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
    ] },
  ],
  admin: [
    { title: 'الرئيسية', items: [
      { to: '/admin', label: 'لوحة التحكم', icon: '📊' },
      { to: '/admin/clients', label: 'العملاء', icon: '⭐' },
      { to: '/admin/accessories', label: 'المخزون', icon: '📦' },
      { to: '/admin/users', label: 'الموظفون', icon: '👥' },
    ] },
    { title: 'المال', items: [
      { to: '/caisse', label: 'الصندوق', icon: '💰' },
      { to: '/admin/debts', label: 'الديون والسلف', icon: '🧾' },
      { to: '/admin/expenses', label: 'مصاريف قطع الغيار', icon: '🔧' },
      { to: '/admin/general-expenses', label: 'مصاريف عامة', icon: '💵' },
      { to: '/admin/expenses-approval', label: 'اعتماد المصاريف', icon: '✅' },
      { to: '/admin/void-requests', label: 'طلبات الإلغاء', icon: '🗑️' },
    ] },
    { title: 'التقارير', items: [
      { to: '/admin/reports/daily', label: 'التقرير اليومي', icon: '📅' },
      { to: '/admin/reports', label: 'التقارير', icon: '📈' },
      { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
    ] },
  ],
}

const ROLE_LABEL = { admin: 'Admin', comptoir: 'Comptoir', technicien: 'Technicien' }

// Desktop (lg and up): fixed column, always visible.
// Mobile: slides in from the left as a drawer when `open` is true, with a dark
// overlay. `onClose` is called on the X, on the overlay and after tapping a link.
// Props are the same as before, so ProtectedLayout.jsx does not change.
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const groups = NAV_BY_ROLE[profile?.role] || []
  const initial = (profile?.full_name || '?').trim().charAt(0).toUpperCase()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-50 w-[270px] max-w-[85vw] shrink-0
          bg-gradient-to-b from-[#1f1f1f] to-[#141414] text-[#e8e8e8] flex flex-col
          border-r border-white/5 transition-transform duration-200 ease-out
          lg:translate-x-0 lg:w-[260px]
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* brand */}
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mobile 4 You" className="w-11 h-11 rounded-xl object-cover shrink-0 ring-2 ring-white/10" />
            <div className="leading-tight">
              <p className="text-[14px] font-extrabold text-white tracking-wide">MOBILE 4 YOU</p>
              <p className="text-[11px] text-[#8d8d8d] mt-0.5">ورشة تصليح الهواتف</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-[#c3c3c3] hover:text-white text-2xl leading-none px-1" aria-label="إغلاق القائمة">×</button>
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="px-3 mb-1.5 text-[10.5px] font-bold tracking-wider text-[#6f6f6f]">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-all ${
                        isActive
                          ? 'bg-gradient-to-l from-[#e4211b]/25 to-[#e4211b]/5 text-white font-semibold shadow-[inset_-3px_0_0_#e4211b]'
                          : 'text-[#bdbdbd] hover:bg-white/[0.06] hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shrink-0 transition-colors ${
                          isActive ? 'bg-[#e4211b]/30' : 'bg-white/[0.05] group-hover:bg-white/10'
                        }`}>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* user card — tap the name to open "حسابي" (change password / email) */}
        <div className="m-3 p-3 rounded-xl bg-white/[0.05] border border-white/5">
          <NavLink
            to="/account"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg p-1.5 -m-1.5 transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/[0.06]'}`
            }
          >
            <div className="w-9 h-9 rounded-full bg-[#e4211b] text-white font-bold flex items-center justify-center shrink-0">{initial}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white truncate">{profile?.full_name || '—'}</p>
              <p className="text-[11px] text-[#9a9a9a]">{ROLE_LABEL[profile?.role] || profile?.role} · حسابي</p>
            </div>
            <span className="text-[#777] text-lg leading-none">‹</span>
          </NavLink>
          <button onClick={handleLogout} className="mt-3 w-full text-center text-[12px] font-semibold text-[#ff8f89] hover:text-white hover:bg-white/5 rounded-lg py-2 transition-colors">
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  )
}
