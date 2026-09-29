import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // عند فتح التطبيق: تحقق إذا فما جلسة دخول محفوظة
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user)
      else setLoading(false)
    })

    // استمع لأي تغيير في حالة الدخول (login/logout)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user)
      else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()
    setUser(authUser)
    setProfile(data) // data.role = 'admin' | 'comptoir' | 'technicien'
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}