import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROLE_LABELS = { admin: 'Admin', comptoir: 'Comptoir', technicien: 'Technicien' }
const EMPTY = { full_name: '', phone: '', email: '', password: '', role: 'comptoir' }
const inputCls = 'w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]'

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let p = ''
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

// calls one of our Edge Functions with the logged-in admin's token
async function callFn(name, body) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  })
  let result = {}
  try { result = await res.json() } catch { /* empty body */ }
  return { ok: res.ok, result }
}

export default function UsersManagement() {
  const [users, setUsers] = useState([])
  const [emails, setEmails] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [edit, setEdit] = useState(null) // { id, full_name, phone, email, role, password, origEmail }
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  // shown once, right after creating an account or resetting a password
  const [credentials, setCredentials] = useState(null) // { name, email, password }
  const [copied, setCopied] = useState(false)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, created_at')
      .neq('role', 'super_admin')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
    const { ok, result } = await callFn('list-employees')
    if (ok) setEmails(result.users || {})
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const { ok, result } = await callFn('create-employee', form)
    setSaving(false)
    if (!ok) { setError(result.error || 'صار خطأ'); return }
    setCredentials({ name: form.full_name, email: form.email.trim().toLowerCase(), password: form.password })
    setForm(EMPTY)
    setShowForm(false)
    loadUsers()
  }

  function openEdit(u) {
    setEditError(null)
    setEdit({ id: u.id, full_name: u.full_name || '', phone: u.phone || '', role: u.role, email: emails[u.id] || '', origEmail: emails[u.id] || '', password: '' })
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setEditError(null)
    setEditSaving(true)
    const body = { user_id: edit.id, full_name: edit.full_name, phone: edit.phone, role: edit.role }
    if (edit.email && edit.email !== edit.origEmail) body.email = edit.email
    if (edit.password) body.password = edit.password
    const { ok, result } = await callFn('update-employee', body)
    setEditSaving(false)
    if (!ok) { setEditError(result.error || 'صار خطأ'); return }
    if (edit.password) {
      setCredentials({ name: edit.full_name, email: edit.email || edit.origEmail, password: edit.password })
    }
    setEdit(null)
    loadUsers()
  }

  async function handleDelete(userId, name) {
    if (!confirm(`متأكد تحب تحذف ${name}؟ هذا يحذف حساب الدخول نهائيًا.`)) return
    const { ok, result } = await callFn('delete-employee', { user_id: userId })
    if (!ok) { alert(result.error || 'صار خطأ في الحذف'); return }
    loadUsers()
  }

  async function copyCredentials() {
    const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h1 className="text-xl font-extrabold text-[#1a1a1a] mb-1">الموظفون</h1>
          <p className="text-sm text-[#6b6b6b]">{users.length} حساب</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-[#1a1a1a] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90">
          {showForm ? 'إلغاء' : '+ إضافة موظف'}
        </button>
      </div>

      {credentials && (
        <div className="bg-[#fff8e6] border border-[#f0d58a] rounded-xl p-5 mb-6 max-w-xl" dir="ltr">
          <div className="flex justify-between items-start gap-3">
            <p className="text-sm font-bold text-[#1a1a1a]">Login for {credentials.name}</p>
            <button onClick={() => setCredentials(null)} className="text-[#6b6b6b] text-lg leading-none" aria-label="close">×</button>
          </div>
          <p className="text-sm mt-2">Email: <b className="select-all">{credentials.email}</b></p>
          <p className="text-sm">Password: <b className="select-all">{credentials.password}</b></p>
          <p className="text-xs text-[#8a6d1d] mt-2" dir="rtl">كلمة السر تظهر هنا مرة وحدة فقط. بعد ما تقفل هذا المربع ما تنجمش تشوفها — تنجم تعمل «كلمة سر جديدة» من زر تعديل.</p>
          <button onClick={copyCredentials} className="mt-3 bg-[#1a1a1a] text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-[#e5e5e5] rounded-xl p-6 mb-6 max-w-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">الهاتف</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">البريد الإلكتروني (للدخول)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">كلمة السر</label>
              <div className="flex gap-2">
                <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} required minLength={6} dir="ltr" />
                <button type="button" onClick={() => setForm({ ...form, password: randomPassword() })} className="shrink-0 border border-[#e5e5e5] rounded-lg px-3 text-xs font-semibold hover:bg-[#faf9f5]">توليد</button>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5">الدور</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
              <option value="comptoir">Comptoir</option>
              <option value="technicien">Technicien</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-[#b3170f] text-sm mb-3">{error}</p>}
          <button type="submit" disabled={saving} className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60">
            {saving ? 'جاري الإضافة...' : 'إضافة الموظف'}
          </button>
        </form>
      )}

      <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-[#6b6b6b]">جاري التحميل...</p>
        ) : (
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-[#faf9f5] text-xs text-[#6b6b6b] font-semibold">
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الاسم</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الإيميل</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الهاتف</th>
                <th className="text-right px-5 py-3 border-b border-[#e5e5e5]">الدور</th>
                <th className="px-5 py-3 border-b border-[#e5e5e5]"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#fbfaf6]">
                  <td className="px-5 py-3.5 border-b border-[#ececE4] font-semibold">{u.full_name}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4] text-[#444]" dir="ltr">{emails[u.id] || '—'}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4] text-[#6b6b6b]">{u.phone || '—'}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4]">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-5 py-3.5 border-b border-[#ececE4] whitespace-nowrap">
                    <button onClick={() => openEdit(u)} className="text-[#1a1a1a] text-xs font-semibold hover:underline ml-4">تعديل</button>
                    <button onClick={() => handleDelete(u.id, u.full_name)} className="text-[#b3170f] text-xs hover:underline">حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* The dark area does NOT close this dialog (so a stray tap never loses what you typed) */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleEditSave} className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-extrabold mb-4">تعديل الموظف</h2>
            <div className="mb-3">
              <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
              <input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className={inputCls} required />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-semibold mb-1.5">الهاتف</label>
              <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={inputCls} />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-semibold mb-1.5">الإيميل (للدخول)</label>
              <input type="email" dir="ltr" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className={inputCls} required />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-semibold mb-1.5">الدور</label>
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className={inputCls}>
                <option value="comptoir">Comptoir</option>
                <option value="technicien">Technicien</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5">كلمة سر جديدة <span className="text-[#6b6b6b] font-normal">(خليها فارغة إذا ما تحبش تبدّلها)</span></label>
              <div className="flex gap-2">
                <input type="text" dir="ltr" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} className={inputCls} minLength={6} placeholder="••••••" />
                <button type="button" onClick={() => setEdit({ ...edit, password: randomPassword() })} className="shrink-0 border border-[#e5e5e5] rounded-lg px-3 text-xs font-semibold hover:bg-[#faf9f5]">توليد</button>
              </div>
            </div>
            {editError && <p className="text-[#b3170f] text-sm mb-3">{editError}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={editSaving} className="bg-[#e4211b] text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-60">
                {editSaving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button type="button" onClick={() => setEdit(null)} className="border border-[#e5e5e5] text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#faf9f5]">إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
