// Product colors: the label is what gets saved in accessories.color (free text is allowed too);
// the hex is only used to draw the little colored dot.
// Kept in its own file (not in ColorDot.jsx) so React Fast Refresh keeps working:
// a component file must export only components.
export const COLORS = [
  ['أسود', '#1a1a1a'], ['أبيض', '#ffffff'], ['رمادي', '#8e8e93'], ['فضي', '#c9ccd1'],
  ['ذهبي', '#d9b36c'], ['أزرق', '#2f6fed'], ['أخضر', '#2e9e5b'], ['أحمر', '#e4211b'],
  ['وردي', '#f08fb4'], ['بنفسجي', '#8e5bd9'], ['برتقالي', '#f28c28'], ['بنّي', '#7a5230'],
]

export function colorHex(label) {
  if (!label) return null
  const l = label.trim()
  const exact = COLORS.find(([n]) => n === l)
  if (exact) return exact[1]
  const part = COLORS.find(([n]) => l.includes(n)) // e.g. "أسود لامع"
  return part ? part[1] : '#c9c9c0' // unknown color name -> neutral grey dot
}
