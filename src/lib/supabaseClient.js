import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,     // keep the login after the app is closed (already the default, written out on purpose)
    autoRefreshToken: true,   // renew the short-lived login token in the background
    detectSessionInUrl: true, // needed by the password-reset link (Phase 6)
    storage: window.localStorage,
    // storageKey is NOT set on purpose: changing it would log everybody out once.
  },
})

// Ask the browser to treat this site's saved data (the login included) as "persistent":
// without it, an Android phone that is low on storage may silently wipe it, and the
// installed app then asks for the email + password again.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {})
}