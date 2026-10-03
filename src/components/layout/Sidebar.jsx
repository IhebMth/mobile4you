import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import logo from '../../assets/logo.png'

const NAV_BY_ROLE = {
  comptoir: [
    { to: '/comptoir', label: 'الطلبات', icon: '📋' },
    { to: '/comptoir/new-order', label: 'استقبال جهاز جديد', icon: '📱' },
    { to: '/comptoir/sell', label: 'بيع إكسسوار', icon: '🛍️' },
    { to: '/comptoir/expenses', label: 'مصاريف قطع الغيار', icon: '🔧' },
    { to: '/comptoir/general-expenses', label: 'مصاريف عامة', icon: '💵' },
    { to: '/caisse', label: 'الصندوق', icon: '💰' },
    { to: '/comptoir/debts', label: 'ديون الحرفاء', icon: '🧾' },
    { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
  ],
  technicien: [
    { to: '/technicien', label: 'أجهزتي', icon: '🔧' },
    { to: '/technicien/expenses', label: 'مصاريف قطع الغيار', icon: '🛠️' },
    { to: '/technicien/general-expenses', label: 'مصاريف عامة', icon: '💵' },
    { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
  ],
  admin: [
    { to: '/admin', label: 'لوحة التحكم', icon: '📊' },
    { to: '/admin/users', label: 'الموظفون', icon: '👥' },
    { to: '/admin/accessories', label: 'المخزون', icon: '📦' },
    { to: '/caisse', label: 'الصندوق', icon: '💰' },
    { to: '/admin/expenses', label: 'مصاريف قطع الغيار', icon: '🔧' },
    { to: '/admin/general-expenses', label: 'مصاريف عامة', icon: '💵' },
    { to: '/admin/expenses-approval', label: 'اعتماد المصاريف', icon: '✅' },
    { to: '/admin/void-requests', label: 'طلبات الإلغاء', icon: '🗑️' },
    { to: '/admin/debts', label: 'الديون والسلف', icon: '🧾' },
    { to: '/admin/reports/daily', label: 'التقرير اليومي', icon: '📅' },
    { to: '/admin/reports', label: 'التقارير', icon: '📈' },
    { to: '/price-guide', label: 'دليل الأسعار', icon: '💲' },
  ],
}

const ROLE_LABEL = { admin: 'Admin', comptoir: 'Comptoir', technicien: 'Technicien' }

// Desktop (lg and up): fixed column, always visible, exactly like before.
// Mobile: hidden off-screen, slides in from the left as a drawer when `open`
// is true, with a dark overlay behind it. `onClose` is called on the X, on
// the overlay, and after tapping any nav link (so the menu closes on
// navigation instead of staying open over the new page).
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const items = NAV_BY_ROLE[profile?.role] || []

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[250px] max-w-[80vw] shrink-0
          bg-[#1a1a1a] text-[#e8e8e8] flex flex-col p-6 overflow-y-auto
          transition-transform duration-200 ease-out
          lg:translate-x-0 lg:w-[230px]
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mobile 4 You" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            <span className="text-[13.5px] font-extrabold text-white tracking-wide leading-tight">
              MOBILE 4 YOU
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-[#c3c3c3] hover:text-white text-2xl leading-none px-1 -mr-1"
            aria-label="إغلاق القائمة"
          >
            ×
          </button>
        </div>

        <nav className="mt-9 flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#e4211b]/20 text-[#ff8f89] font-semibold border-r-[3px] border-[#e4211b]'
                    : 'text-[#c3c3c3] hover:bg-white/5'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10 text-xs text-[#9a9a9a]">
          <p>مسجل دخول كـ: {ROLE_LABEL[profile?.role] || profile?.role}</p>
          {profile?.full_name && <p className="mt-1 text-[#c3c3c3]">{profile.full_name}</p>}
          <button onClick={handleLogout} className="mt-3 text-[#ff8f89] hover:text-white text-xs">
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  )
}
