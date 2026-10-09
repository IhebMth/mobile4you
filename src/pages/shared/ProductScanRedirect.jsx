import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Opened by scanning a stock label: /p/<product id>
// comptoir -> sale dialog for that product; admin -> its edit sheet; technician -> a short message.
export default function ProductScanRedirect() {
  const { productId } = useParams()
  const { profile } = useAuth()
  if (!profile) return <p style={{ padding: 40 }}>جاري الفتح...</p>
  if (profile.role === 'comptoir') return <Navigate to={`/comptoir/sell?item=${productId}`} replace />
  if (profile.role === 'admin' || profile.role === 'super_admin') return <Navigate to={`/admin/accessories?item=${productId}`} replace />
  return <p style={{ padding: 40 }}>هذا ملصق منتج للبيع — يفتح عند الكاشي أو الأدمن.</p>
}
