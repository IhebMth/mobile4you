import { supabase } from './lib/supabaseClient'
import { useEffect } from 'react'
import AppRoutes from './routes/AppRoutes.jsx'

function App() {
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .then(({ data, error }) => {
        console.log('profiles:', data, error)
      })
  }, [])

  return <AppRoutes />
}

export default App