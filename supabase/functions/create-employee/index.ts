import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  // Only POST
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405
    )
  }

  try {
    // --------------------------------------------------
    // 1. Get logged-in user's access token
    // --------------------------------------------------

    const authHeader = req.headers.get("Authorization")

    if (!authHeader) {
      return jsonResponse(
        { error: "غير مصرح" },
        401
      )
    }

    // --------------------------------------------------
    // 2. Client using the current user's token
    // --------------------------------------------------

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    // --------------------------------------------------
    // 3. Verify logged-in user
    // --------------------------------------------------

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(
        { error: "غير مصرح" },
        401
      )
    }

    // --------------------------------------------------
    // 4. Get caller profile / role
    // --------------------------------------------------

    const {
      data: callerProfile,
      error: callerProfileError,
    } = await supabaseClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single()

    if (
      callerProfileError ||
      !callerProfile ||
      !["admin", "super_admin"].includes(
        callerProfile.role
      )
    ) {
      return jsonResponse(
        {
          error:
            "فقط Admin أو Super Admin يقدر يضيف موظفين",
        },
        403
      )
    }

    // --------------------------------------------------
    // 5. Read request body
    // --------------------------------------------------

    const body = await req.json()

    const {
      email,
      password,
      full_name,
      phone,
      role,
    } = body

    // --------------------------------------------------
    // 6. Validate required fields
    // --------------------------------------------------

    if (
      !email ||
      !password ||
      !full_name ||
      !role
    ) {
      return jsonResponse(
        {
          error:
            "email و password و full_name و role مطلوبين",
        },
        400
      )
    }

    // --------------------------------------------------
    // 7. Validate role
    // --------------------------------------------------

    const allowedRoles = [
      "technician",
      "receptionist",
      "admin",
      "super_admin",
    ]

    if (!allowedRoles.includes(role)) {
      return jsonResponse(
        {
          error: "Role غير صالح",
        },
        400
      )
    }

    // --------------------------------------------------
    // 8. Normal Admin cannot create Admin/Super Admin
    // --------------------------------------------------

    if (
      ["admin", "super_admin"].includes(role) &&
      callerProfile.role !== "super_admin"
    ) {
      return jsonResponse(
        {
          error:
            "فقط Super Admin يقدر يضيف Admin أو Super Admin",
        },
        403
      )
    }

    // --------------------------------------------------
    // 9. Get Service Role Key
    // --------------------------------------------------

    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY")

    if (!serviceRoleKey) {
      throw new Error(
        "SERVICE_ROLE_KEY غير موجود"
      )
    }

    // --------------------------------------------------
    // 10. Create admin Supabase client
    // --------------------------------------------------

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    )

    // --------------------------------------------------
    // 11. Create Auth user
    // --------------------------------------------------

    const {
      data: newUser,
      error: createError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,

        user_metadata: {
          full_name,
          role,
          phone: phone || null,
        },
      })

    if (createError || !newUser.user) {
      return jsonResponse(
        {
          error:
            createError?.message ||
            "فشل إنشاء المستخدم",
        },
        400
      )
    }

    // --------------------------------------------------
    // 12. Update profile
    // --------------------------------------------------

    const {
      error: profileUpdateError,
    } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name,
        phone: phone || null,
        role,
      })
      .eq("id", newUser.user.id)

    // --------------------------------------------------
    // 13. If profile update failed, delete Auth user
    // --------------------------------------------------

    if (profileUpdateError) {
      await supabaseAdmin.auth.admin.deleteUser(
        newUser.user.id
      )

      return jsonResponse(
        {
          error:
            "تم إنشاء الحساب لكن فشل تحديث profile",
          details:
            profileUpdateError.message,
        },
        500
      )
    }

    // --------------------------------------------------
    // 14. Success
    // --------------------------------------------------

    return jsonResponse({
      success: true,
      message: "تم إنشاء الموظف بنجاح",
      user_id: newUser.user.id,
    })
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "حدث خطأ غير معروف"

    return jsonResponse(
      {
        error: message,
      },
      500
    )
  }
})