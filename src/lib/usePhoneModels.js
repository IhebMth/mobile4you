import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// The names of the phone models in the catalogue (Catalogue téléphones).
// Used to autocomplete the "device model" field when receiving a device.
export function usePhoneModelNames() {
  const [names, setNames] = useState([])
  useEffect(() => {
    let alive = true
    supabase
      .from('phone_models')
      .select('name')
      .order('name')
      .then(({ data }) => {
        if (alive) setNames((data || []).map((r) => r.name))
      })
    return () => { alive = false }
  }, [])
  return names
}
