import { colorHex } from '../../lib/productColors'

// <ColorDot label="أسود" />  -> ● أسود   (renders nothing when there is no color)
// Only the component is exported from this file (Fast Refresh requirement);
// the color list and colorHex() live in src/lib/productColors.js.
export default function ColorDot({ label, className = '' }) {
  const hex = colorHex(label)
  if (!hex) return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-[#6b6b6b] ${className}`}>
      <span className="w-3 h-3 rounded-full border border-black/15 shrink-0" style={{ background: hex }} aria-hidden="true" />
      {label}
    </span>
  )
}
