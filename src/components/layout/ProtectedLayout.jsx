import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f7] text-[#6b6b6b]">
        جاري التحقق...
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(profile?.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return (
    <div className="flex min-h-screen bg-[#f7f7f7]">
      <Sidebar />
      <main className="flex-1 p-10 max-w-[1180px]">
        <Outlet />
      </main>
    </div>
  )
}