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
    // 1. Get authorization header
    // --------------------------------------------------

    const authHeader =
      req.headers.get("Authorization")

    if (!authHeader) {
      return jsonResponse(
        { error: "غير مصرح" },
        401
      )
    }

    // --------------------------------------------------
    // 2. Client using current user's token
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
    // 3. Verify current user
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
    // 4. Get caller role
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
            "فقط Admin أو Super Admin يقدر يحذف موظفين",
        },
        403
      )
    }

    // --------------------------------------------------
    // 5. Read target user ID
    // --------------------------------------------------

    const { user_id } = await req.json()

    if (!user_id) {
      return jsonResponse(
        {
          error: "user_id مطلوب",
        },
        400
      )
    }

    // --------------------------------------------------
    // 6. Prevent self deletion
    // --------------------------------------------------

    if (user_id === user.id) {
      return jsonResponse(
        {
          error:
            "ما تقدرش تحذف حسابك الخاص",
        },
        400
      )
    }

    // --------------------------------------------------
    // 7. Get Service Role Key
    // --------------------------------------------------

    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY")

    if (!serviceRoleKey) {
      throw new Error(
        "SERVICE_ROLE_KEY غير موجود"
      )
    }

    // --------------------------------------------------
    // 8. Admin Supabase client
    // --------------------------------------------------

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    )

    // --------------------------------------------------
    // 9. Get target profile
    // --------------------------------------------------

    const {
      data: targetProfile,
      error: targetProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user_id)
      .single()

    if (
      targetProfileError ||
      !targetProfile
    ) {
      return jsonResponse(
        {
          error: "الموظف غير موجود",
        },
        404
      )
    }

    // --------------------------------------------------
    // 10. Admin cannot delete Admin/Super Admin
    // --------------------------------------------------

    if (
      ["admin", "super_admin"].includes(
        targetProfile.role
      ) &&
      callerProfile.role !== "super_admin"
    ) {
      return jsonResponse(
        {
          error:
            "فقط Super Admin يقدر يحذف Admin أو Super Admin",
        },
        403
      )
    }

    // --------------------------------------------------
    // 11. Delete Auth user
    // --------------------------------------------------

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(
        user_id
      )

    if (deleteError) {
      return jsonResponse(
        {
          error: deleteError.message,
        },
        400
      )
    }

    // --------------------------------------------------
    // 12. Success
    // --------------------------------------------------

    return jsonResponse({
      success: true,
      message: "تم حذف الموظف بنجاح",
      user_id,
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