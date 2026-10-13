import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../i18n/LanguageContext'

// Opened by scanning the sticker on a device: /o/ORD12345678
// technicien / admin -> the repair details page; comptoir -> the orders list pre-filtered.
export default function ScanRedirect() {
  const { orderNumber } = useParams()
  const { profile } = useAuth()
  const [target, setTarget] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const comptoirTarget = profile?.role === 'comptoir'
    ? `/comptoir?q=${encodeURIComponent(orderNumber)}`
    : null

  useEffect(() => {
    if (!profile || comptoirTarget) return

    supabase.from('repair_orders').select('id').eq('order_number', orderNumber).maybeSingle()
      .then(({ data }) => (data ? setTarget(`/technicien/order/${data.id}`) : setNotFound(true)))
  }, [profile, orderNumber, comptoirTarget])

  if (comptoirTarget) return <Navigate to={comptoirTarget} replace />
  if (target) return <Navigate to={target} replace />
  if (notFound) return <p style={{ padding: 40 }}>{t('Commande')} {orderNumber}  {t('introuvable ou non assigné à vous')}</p>
  return <p style={{ padding: 40 }}>{t('Ouverture...')}</p>
}
