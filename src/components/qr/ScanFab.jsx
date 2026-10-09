import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ScanDialog from './ScanDialog'
import { routeFromScan } from '../../lib/scanRoute'

// Floating "📷 مسح" button shown on every logged-in page (rendered by ProtectedLayout).
// Bottom-RIGHT on purpose: bottom-left sits on top of the sidebar's logout button on desktop.
export default function ScanFab() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)

  function handleResult(text) {
    const path = routeFromScan(text)
    setOpen(false)
    if (path) { navigate(path); return }
    setToast('هذا الكود ما هوش من نظامنا')
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="مسح كود QR"
        className="no-print fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#e4211b] text-white text-2xl shadow-lg active:scale-95 transition">
        📷
      </button>
      {toast && (
        <div className="no-print fixed bottom-24 right-5 z-40 bg-[#1a1a1a] text-white text-sm rounded-lg px-4 py-2.5 shadow-lg">{toast}</div>
      )}
      {open && <ScanDialog onResult={handleResult} onClose={() => setOpen(false)} />}
    </>
  )
}
