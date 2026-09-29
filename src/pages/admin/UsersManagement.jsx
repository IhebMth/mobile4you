import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROLE_LABELS = { admin: 'Admin', comptoir: 'Comptoir', technicien: 'Technicien' }

export default function UsersManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', role: 'comptoir' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    // super_admin يُستثنى تلقائيًا هنا لاحقًا عبر view مخصص (القسم 1 من الدليل الكبير)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, created_at')
      .neq('role', 'super_admin')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session.access_token

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      }
    )
    const result = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(result.error || 'صار خطأ')
      return
    }

    setForm({ full_name: '', phone: '', email: '', password: '', role: 'comptoir' })
    setShowForm(false)
    loadUsers()
  }

  async function handleDelete(userId, name) {
    if (!confirm(`متأكد تحب تحذف ${name}؟ هذا يحذف حساب الدخول نهائيًا.`)) return

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session.access_token

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-employee`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      }
    )
    const result = await res.json()

    if (!res.ok) {
      alert(result.error || 'صار خطأ في الحذف')
      return
    }
    loadUsers()
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">الموظفون</h1>
          <p className="text-sm text-[#6b6b6b]">{users.length} حساب</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90"
        >
          {showForm ? 'إلغاء' : '+ إضافة موظف'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-[#e5e5e5] rounded-xl p-6 mb-6 max-w-xl"
        >
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">الهاتف</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">البريد الإلكتروني (للدخول)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">كلمة السر</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">الدور</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm"
            >
              <option value="comptoir">Comptoir</option>
              <option value="technicien">Technicien</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && <p className="text-[#b3170f] text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'جاري الإضافة...' : 'إضافة الموظف'}
          </button>
        </form>
      )}

      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الاسم</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الهاتف</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الدور</th>
                <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#fbfaf6]">
                  <td className="px-5 py-3.5 border-b border-[#ececE4] font-semibold">{u.full_name}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4] text-[#6b6b6b]">{u.phone || '—'}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">
                    <button
                      onClick={() => handleDelete(u.id, u.full_name)}
                      className="text-[#b3170f] text-xs hover:underline"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}