import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PrintOrderDialog from '../../components/qr/PrintOrderDialog'
import { t } from '../../i18n/LanguageContext'
import { usePhoneModelNames } from '../../lib/usePhoneModels'

export default function NewRepairOrder() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deviceModel, setDeviceModel] = useState('')
  const phoneModels = usePhoneModelNames()
  const [issue, setIssue] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [technicians, setTechnicians] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [printOrder, setPrintOrder] = useState(null) // set after save -> shows the QR / print dialog

  useEffect(() => {
    async function loadTechnicians() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['technicien', 'admin'])
        .order('full_name')

      if (error) {
        setError(t('Erreur de chargement de la liste des techniciens :') + ' ' + error.message)
        return
      }
      setTechnicians(data || [])
    }
    loadTechnicians()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!clientName.trim() || !clientPhone.trim() || !deviceModel.trim() || !issue.trim()) {
      setError(t('Remplissez tous les champs obligatoires'))
      return
    }
    if (!technicianId) {
      setError(t('Vous devez choisir le technicien qui prendra l\'appareil'))
      return
    }

    setSaving(true)

    let clientId
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', clientPhone.trim())
      .maybeSingle()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({ full_name: clientName.trim(), phone: clientPhone.trim() })
        .select('id')
        .single()

      if (clientError) {
        setSaving(false)
        setError(t('Erreur de création du client :') + ' ' + clientError.message)
        return
      }
      clientId = newClient.id
    }

    const orderNumber = 'ORD' + Date.now().toString().slice(-8)

    const { data: createdOrder, error: orderError } = await supabase.from('repair_orders').insert({
      order_number: orderNumber,
      client_id: clientId,
      device_model: deviceModel.trim(),
      issue_description: issue.trim(),
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      comptoir_id: user.id,
      technician_id: technicianId,
      status: 'received',
    }).select('id, order_number, access_token, created_at').single()

    setSaving(false)

    if (orderError) setError(t('Erreur :') + ' ' + orderError.message)
    else setPrintOrder({
      ...createdOrder,
      device_model: deviceModel.trim(),
      issue_description: issue.trim(),
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      client_name: clientName.trim(),
    })
  }

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">{t('Réception d\'un nouvel appareil')}</h1>
        <p className="text-sm text-[#6b6b6b]">{t('Remplissez les données du client et de l\'appareil pour démarrer la réparation')}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#e5e5e5] rounded-xl p-8 max-w-xl">
        <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-4 border-b border-[#e5e5e5]">{t('Informations du client')}</h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('Nom du client')}</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('Exemple : Sami Trabelsi')} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" required />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('N° de téléphone')}</label>
          <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="21654321" className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" required />
        </div>

        <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-4 mt-7 border-b border-[#e5e5e5]">{t('Informations de l\'appareil')}</h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('Modèle de l\'appareil')}</label>
          <datalist id="phone-model-options">{phoneModels.map((n) => <option key={n} value={n} />)}</datalist>
          <input list="phone-model-options" value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} placeholder={t('Exemple : iPhone 12 Pro')} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" required />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('Description de la panne')}</label>
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={t('Exemple : écran cassé, ne charge pas...')} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm min-h-[80px] resize-y focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" required />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">{t('Technicien assigné')}</label>
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" required>
            <option value="">{t('-- Choisir un technicien --')}</option>
            {technicians.map((tc) => (
              <option key={tc.id} value={tc.id}>{tc.full_name}{tc.id === user.id ? ' (' + t('Moi') + ')' : tc.role === 'admin' ? ' · Admin' : ''}</option>
            ))}
          </select>
          {technicians.length === 0 && (
            <p className="text-xs text-[#b3170f] mt-1.5">{t('Aucun technicien n\'est enregistré dans le système pour le moment.')}</p>
          )}
        </div>

        <div className="mb-2">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">
            
            {t('Prix estimé')} <span className="text-[#6b6b6b] font-normal text-xs">{t('(facultatif)')}</span>
          </label>
          <div className="flex gap-2.5">
            <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder={t('De (DT)')} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" />
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder={t('À (DT)')} className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]" />
          </div>
        </div>

        {error && <p className="text-[#b3170f] text-sm mt-3">{error}</p>}

        <div className="flex gap-2.5 mt-6 pt-5 border-t border-[#e5e5e5]">
          <button type="submit" disabled={saving} className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60">
            {saving ? t('Enregistrement...') : t('Enregistrer et réceptionner')}
          </button>
          <button type="button" onClick={() => navigate('/comptoir')} className="border border-[#e5e5e5] text-[#1a1a1a] text-sm px-4 py-2.5 rounded-lg hover:bg-[#f7f7f7]">
            
            {t('Annuler')}
          </button>
        </div>
      </form>

      {printOrder && (
        <PrintOrderDialog order={printOrder} onClose={() => navigate('/comptoir')} />
      )}
    </div>
  )
}
