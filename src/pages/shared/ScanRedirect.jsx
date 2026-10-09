import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

// Opened by scanning the sticker on a device: /o/ORD12345678
// technicien / admin -> the repair details page; comptoir -> the orders list pre-filtered.
export default function ScanRedirect() {
  const { orderNumber } = useParams()
  const { profile } = useAuth()
  const [target, setTarget] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!profile || profile.role === 'comptoir') return
    supabase.from('repair_orders').select('id').eq('order_number', orderNumber).maybeSingle()
      .then(({ data }) => (data ? setTarget(`/technicien/order/${data.id}`) : setNotFound(true)))
  }, [profile, orderNumber])

  if (profile?.role === 'comptoir') {
    return <Navigate to={`/comptoir?q=${encodeURIComponent(orderNumber)}`} replace />
  }
  if (target) return <Navigate to={target} replace />
  if (notFound) return <p style={{ padding: 40 }}>الطلب {orderNumber} غير موجود أو ما هوش مسند ليك</p>
  return <p style={{ padding: 40 }}>جاري الفتح...</p>
}
