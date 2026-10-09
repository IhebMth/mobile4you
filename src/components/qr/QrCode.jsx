import { QRCodeSVG } from 'qrcode.react'

// White box + quiet zone so printers and phone cameras read it reliably.
// Level "M" = still readable if a corner gets scratched or smudged.
export default function QrCode({ value, size = 128 }) {
  return (
    <div style={{ background: '#fff', padding: 6, display: 'inline-block', lineHeight: 0 }}>
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  )
}
