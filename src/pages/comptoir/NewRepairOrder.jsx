import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

export default function NewRepairOrder() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deviceModel, setDeviceModel] = useState('')
  const [issue, setIssue] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [technicians, setTechnicians] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadTechnicians() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'technicien')
        .order('full_name')

      if (error) {
        setError('خطأ في جلب قائمة التقنيين: ' + error.message)
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
      setError('عمر كل الحقول الإجبارية')
      return
    }
    if (!technicianId) {
      setError('لازم تختار التقني اللي رح ياخذ الجهاز')
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
        setError('خطأ في إنشاء الحريف: ' + clientError.message)
        return
      }
      clientId = newClient.id
    }

    const orderNumber = 'ORD' + Date.now().toString().slice(-8)

    const { error: orderError } = await supabase.from('repair_orders').insert({
      order_number: orderNumber,
      client_id: clientId,
      device_model: deviceModel.trim(),
      issue_description: issue.trim(),
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      comptoir_id: user.id,
      technician_id: technicianId,
      status: 'received',
    })

    setSaving(false)

    if (orderError) setError('خطأ: ' + orderError.message)
    else navigate('/comptoir')
  }

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-[#e5e5e5]">
        <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">استقبال جهاز جديد</h1>
        <p className="text-sm text-[#6b6b6b]">عمر بيانات الحريف والجهاز باش تبدا عملية الصيانة</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#e5e5e5] rounded-xl p-8 max-w-xl"
      >
        <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-4 border-b border-[#e5e5e5]">
          معلومات الحريف
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">اسم الحريف</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="مثال: سامي الطرابلسي"
            className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">رقم الهاتف</label>
          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="21654321"
            className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            required
          />
        </div>

        <h3 className="text-xs font-bold text-[#e4211b] pb-2 mb-4 mt-7 border-b border-[#e5e5e5]">
          معلومات الجهاز
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">موديل الجهاز</label>
          <input
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            placeholder="مثال: iPhone 12 Pro"
            className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">وصف العطل</label>
          <textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="مثال: الشاشة مكسورة، ما يشحنش..."
            className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm min-h-[80px] resize-y focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">التقني المسنّد</label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            required
          >
            <option value="">-- اختار تقني --</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          {technicians.length === 0 && (
            <p className="text-xs text-[#b3170f] mt-1.5">ما فماش تقنيين مسجلين حاليًا في النظام.</p>
          )}
        </div>

        <div className="mb-2">
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">
            السعر التقديري <span className="text-[#6b6b6b] font-normal text-xs">(اختياري)</span>
          </label>
          <div className="flex gap-2.5">
            <input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="من (د.ت)"
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            />
            <input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="إلى (د.ت)"
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b] bg-[#fdfdfb]"
            />
          </div>
        </div>

        {error && <p className="text-[#b3170f] text-sm mt-3">{error}</p>}

        <div className="flex gap-2.5 mt-6 pt-5 border-t border-[#e5e5e5]">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ واستقبال'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/comptoir')}
            className="border border-[#e5e5e5] text-[#1a1a1a] text-sm px-4 py-2.5 rounded-lg hover:bg-[#f7f7f7]"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}