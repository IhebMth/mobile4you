import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'
import logo from '../../assets/logo.png'
import ScanFab from '../qr/ScanFab'

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f7] text-[#6b6b6b]">
        جاري التحقق...
      </div>
    )
  }
  // Not logged in: remember where they were going so Login can send them back there.
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (allowedRoles && !allowedRoles.includes(profile?.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] lg:flex">
      {/* Mobile-only top bar with the hamburger button. Hidden from lg up,
          where the sidebar is already always visible on the side. */}
      <header className="lg:hidden flex items-center justify-between bg-[#1a1a1a] text-white px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Mobile 4 You" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-[12px] font-extrabold tracking-wide">MOBILE 4 YOU</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -mr-2"
          aria-label="فتح القائمة"
        >
          <span className="block w-6 h-0.5 bg-white mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-white mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-white"></span>
        </button>
      </header>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* p-4 on phones, p-6 on tablets, p-10 + max width on desktop, same as before */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 lg:max-w-295">
        <Outlet />
      </main>

      {/* floating camera button: scans repair stickers and stock labels (Phase 4b) */}
      <ScanFab />
    </div>
  )
}