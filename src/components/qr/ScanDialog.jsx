import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Opens the camera and reads QR codes in the page itself (no need to open the phone's Camera app).
// onResult(text) is called once with the QR content. The browser only allows the camera on
// https:// pages (or localhost) — so test it on the Vercel address, not on http://192.168.x.x.
export default function ScanDialog({ onResult, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const resultRef = useRef(onResult)
  const [error, setError] = useState(null)

  useEffect(() => { resultRef.current = onResult }, [onResult])

  useEffect(() => {
    let stream = null
    let raf = 0
    let stopped = false
    let last = 0

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('الكاميرا تخدم برك على رابط https (مش http عادي). استعمل رابط Vercel.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        })
        // the dialog was closed while the camera was still starting: release it right away
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()

        const tick = (t) => {
          if (stopped) return
          raf = requestAnimationFrame(tick)
          if (t - last < 120 || v.readyState < 2 || !v.videoWidth) return // ~8 reads / second is plenty
          last = t
          const c = canvasRef.current
          const scale = Math.min(1, 640 / v.videoWidth)
          c.width = Math.round(v.videoWidth * scale)
          c.height = Math.round(v.videoHeight * scale)
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(v, 0, 0, c.width, c.height)
          const img = ctx.getImageData(0, 0, c.width, c.height)
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) { stopped = true; resultRef.current(code.data) }
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setError(e.name === 'NotAllowedError'
          ? 'لازم تسمح للتطبيق باستعمال الكاميرا (من إعدادات المتصفح).'
          : 'ما نجمتش نحل الكاميرا: ' + e.message)
      }
    }
    start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop()) // always release the camera
    }
  }, [])

  return (
    <div className="no-print fixed inset-0 z-70 bg-black/80 flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
          <h3 className="font-extrabold text-sm">📷 مسح كود QR</h3>
          <button onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]">✕</button>
        </div>
        {error ? (
          <p className="p-6 text-sm text-[#b3170f] text-center">{error}</p>
        ) : (
          <div className="relative bg-black aspect-square">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {/* aiming frame */}
            <div className="absolute inset-[18%] border-2 border-white/90 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
        <p className="text-xs text-[#6b6b6b] text-center px-4 py-3">
          وجّه الكاميرا للكود: ملصق جهاز (صيانة) أو ملصق منتج (مخزون)
        </p>
      </div>
    </div>
  )
}
