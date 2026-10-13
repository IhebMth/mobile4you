import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { t } from '../../i18n/LanguageContext'

// Opened by scanning a stock label: /p/<product id>
// comptoir -> sale dialog for that product; admin -> its edit sheet; technician -> a short message.
export default function ProductScanRedirect() {
  const { productId } = useParams()
  const { profile } = useAuth()
  if (!profile) return <p style={{ padding: 40 }}>{t('Ouverture...')}</p>
  if (profile.role === 'comptoir') return <Navigate to={`/comptoir/sell?item=${productId}`} replace />
  if (profile.role === 'admin' || profile.role === 'super_admin') return <Navigate to={`/admin/accessories?item=${productId}`} replace />
  return <p style={{ padding: 40 }}>{t('Ceci est une étiquette de produit en vente — elle s\'ouvre à la caisse ou chez l\'administrateur.')}</p>
}
