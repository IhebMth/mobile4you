const STATUS_STYLES = {
  received: { bg: 'bg-[#eeeeee]', text: 'text-[#5c6b6f]', dot: 'bg-[#8a8a8a]', label: 'استُلم' },
  diagnosing: { bg: 'bg-[#fdecd8]', text: 'text-[#8a4f06]', dot: 'bg-[#c9750a]', label: 'تشخيص' },
  in_repair: { bg: 'bg-[#eeeeee]', text: 'text-[#1a1a1a]', dot: 'bg-[#1a1a1a]', label: 'قيد الإصلاح' },
  ready: { bg: 'bg-[#e3f0e8]', text: 'text-[#2b5940]', dot: 'bg-[#1f8a4c]', label: 'جاهز للاستلام' },
  delivered: { bg: 'bg-[#e5eef6]', text: 'text-[#204a6b]', dot: 'bg-[#1f5fa8]', label: 'تم التسليم' },
  cancelled: { bg: 'bg-[#fdeaea]', text: 'text-[#a13d3d]', dot: 'bg-[#a13d3d]', label: 'ملغى' },
}

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.received
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>
      {s.label}
    </span>
  )
}