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
  if (!authHeader) return json({ error: 'Non autorisé' }, 401)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return json({ error: 'Non autorisé' }, 401)
  const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).single()
  if (!p || !["admin", "super_admin"].includes(p.role)) return json({ error: 'Seul l\'administrateur peut faire cela' }, 403)
  return { caller: user, callerRole: p.role as string }
}
// your project stores the key under the secret name SERVICE_ROLE_KEY; the built-in name is also accepted
const admin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  (Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  try {
    const g = await requireAdmin(req)
    if (g instanceof Response) return g

    const b = await req.json()
    const email = String(b.email ?? "").trim().toLowerCase()
    const password = String(b.password ?? "")
    const full_name = String(b.full_name ?? "").trim()
    const phone = String(b.phone ?? "").trim() || null
    const role = cleanRole(b.role)

    if (!email || !password || !full_name) return json({ error: 'Données manquantes' }, 400)
    if (!role) return json({ error: 'Rôle invalide : ' + String(b.role) }, 400)
    if (password.length < 6) return json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, 400)
    if (role === "admin" && g.callerRole !== "super_admin")
      return json({ error: 'Seul le Super Admin peut ajouter un compte admin' }, 403)

    const sa = admin()
    const { data: created, error: cErr } = await sa.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name, role },
    })
    if (cErr) return json({ error: cErr.message }, 400)

    // the trigger handle_new_user already created the profile with this role.
    // We only add the phone here (and the role only if it differs).
    const { data: prof } = await sa.from("profiles").select("role").eq("id", created.user.id).maybeSingle()
    const patch: Record<string, unknown> = { phone }
    if (!prof) {
      await sa.from("profiles").insert({ id: created.user.id, full_name, role, phone })
    } else {
      if (prof.role !== role) patch.role = role
      const { error: uErr } = await sa.from("profiles").update(patch).eq("id", created.user.id)
      if (uErr) return json({ success: true, user_id: created.user.id, warning: uErr.message })
    }
    return json({ success: true, user_id: created.user.id })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
