// src/hooks/useAuth.js (مختصر)
import { supabase } from '../lib/supabaseClient'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single()

  return profile // يحتوي role: admin / comptoir / technicien
}