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

// Returns { users: { [id]: email } } so the admin page can show each employee's login email.
// (Emails live in auth.users, which the browser cannot read directly.)
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  try {
    const g = await requireAdmin(req)
    if (g instanceof Response) return g
    const sa = admin()
    const map: Record<string, string> = {}
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await sa.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return json({ error: error.message }, 400)
      for (const u of data.users) map[u.id] = u.email ?? ""
      if (data.users.length < 200) break
    }
    return json({ users: map })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
