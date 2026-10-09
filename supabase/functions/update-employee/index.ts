import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const ROLES = ["admin", "comptoir", "technicien"]
// accepts "Technicien", " technicien ", "technician"... and always returns the exact DB value
function cleanRole(r: unknown) {
  const v = String(r ?? "").trim().toLowerCase()
  if (v === "technician" || v === "tech") return "technicien"
  if (v === "counter") return "comptoir"
  return ROLES.includes(v) ? v : null
}

// returns { caller, callerRole } or a Response when not allowed
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json({ error: "غير مصرح" }, 401)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return json({ error: "غير مصرح" }, 401)
  const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).single()
  if (!p || !["admin", "super_admin"].includes(p.role)) return json({ error: "فقط الأدمن يقدر يعمل هذا" }, 403)
  return { caller: user, callerRole: p.role as string }
}
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  try {
    const g = await requireAdmin(req)
    if (g instanceof Response) return g

    const b = await req.json()
    const user_id = String(b.user_id ?? "")
    if (!user_id) return json({ error: "user_id مطلوب" }, 400)

    const sa = admin()
    const { data: target } = await sa.from("profiles").select("role").eq("id", user_id).single()
    if (!target) return json({ error: "الموظف غير موجود" }, 404)
    if (["admin", "super_admin"].includes(target.role) && g.callerRole !== "super_admin" && user_id !== g.caller.id)
      return json({ error: "فقط Super Admin يقدر يعدّل حساب admin" }, 403)

    // ---- profile fields
    const patch: Record<string, unknown> = {}
    if (b.full_name !== undefined) {
      const n = String(b.full_name).trim()
      if (!n) return json({ error: "الاسم مطلوب" }, 400)
      patch.full_name = n
    }
    if (b.phone !== undefined) patch.phone = String(b.phone).trim() || null
    if (b.role !== undefined) {
      const r = cleanRole(b.role)
      if (!r) return json({ error: "الدور غير صالح: " + String(b.role) }, 400)
      if (r !== target.role) {
        if (user_id === g.caller.id) return json({ error: "ما تقدرش تبدّل دورك أنت" }, 400)
        if ((r === "admin" || target.role === "admin") && g.callerRole !== "super_admin")
          return json({ error: "فقط Super Admin يبدّل دور admin" }, 403)
        patch.role = r
      }
    }
    if (Object.keys(patch).length) {
      const { error } = await sa.from("profiles").update(patch).eq("id", user_id)
      if (error) return json({ error: error.message }, 400)
    }

    // ---- login fields (email / password)
    const auth: Record<string, unknown> = {}
    if (b.email !== undefined) {
      const e = String(b.email).trim().toLowerCase()
      if (!e) return json({ error: "الإيميل مطلوب" }, 400)
      auth.email = e
      auth.email_confirm = true
    }
    if (b.password) {
      if (String(b.password).length < 6) return json({ error: "كلمة السر لازم 6 أحرف على الأقل" }, 400)
      auth.password = String(b.password)
    }
    if (patch.full_name || patch.role) auth.user_metadata = { ...(patch.full_name ? { full_name: patch.full_name } : {}), ...(patch.role ? { role: patch.role } : {}) }
    if (Object.keys(auth).length) {
      const { error } = await sa.auth.admin.updateUserById(user_id, auth)
      if (error) return json({ error: error.message }, 400)
    }
    return json({ success: true })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
