import { colorHex, colorLabel } from '../../lib/productColors'

// Small colour swatch + the colour name. Renders nothing when there is no colour.
// <ColorDot label={item.color} className="mt-1" />
export default function ColorDot({ label, className = '' }) {
  const name = String(label || '').trim()
  if (!name) return null
  const hex = colorHex(name)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-[#6b6b6b] ${className}`}>
      <span
        className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0"
        style={{ background: hex || 'repeating-linear-gradient(45deg,#e5e5e5,#e5e5e5 3px,#fff 3px,#fff 6px)' }}
        aria-hidden="true"
      />
      {colorLabel(name)}
    </span>
  )
}
