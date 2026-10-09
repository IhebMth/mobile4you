import { useState } from 'react'
import { createPortal } from 'react-dom'
import QrCode from './QrCode'
import { SHOP, productUrl } from '../../lib/shopConfig'
import { phoneOf } from '../../lib/phoneDetails'

// Prints the QR label for a stock item (phone or accessory). Scanning it in the app opens the item:
// comptoir -> the sale dialog is already open, admin -> the edit sheet.
// item = row from accessories (id, name, color, sale_price, stock_quantity, category, phone_details)
function Label({ item, showPrice }) {
  const pd = phoneOf(item)
  return (
    <div className="label">
      <QrCode value={productUrl(item.id)} size={78} />
      <div className="t">
        <div className="nm">{item.name}</div>
        {item.color && <div className="cl">{item.color}</div>}
        {item.category === 'phone' && pd?.imei && <div className="im">IMEI {pd.imei}</div>}
        {showPrice && <div className="pr">{Number(item.sale_price).toFixed(2).replace(/\.00$/, '')} د.ت</div>}
        <div className="sh">{SHOP.name}</div>
      </div>
    </div>
  )
}

export default function LabelPrintDialog({ item, onClose }) {
  const stock = Number(item.stock_quantity) || 1
  const [copies, setCopies] = useState(1)
  const [showPrice, setShowPrice] = useState(true)
  const [layout, setLayout] = useState('roll') // roll = one label per page (label printer) | sheet = A4 grid

  const n = Math.min(60, Math.max(1, Number(copies) || 1))

  return (
    <>
      <div className="no-print fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
        {/* No tap-outside-to-close: same reasoning as the product form — closes via ✕ only. */}
        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-base">🏷️ ملصق المنتج</h3>
            <button onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-full text-[#6b6b6b] hover:bg-[#f3f1ea]">✕</button>
          </div>

          {/* on-screen preview of one label */}
          <div className="flex justify-center mb-4">
            <div className="border border-dashed border-[#bdbdb5] rounded-lg p-2 bg-white flex items-center gap-2 w-[250px] h-[150px]">
              <QrCode value={productUrl(item.id)} size={90} />
              <div className="min-w-0 text-right">
                <p className="text-xs font-extrabold leading-tight line-clamp-3">{item.name}</p>
                {item.color && <p className="text-[11px] text-[#6b6b6b]">{item.color}</p>}
                {showPrice && <p className="text-sm font-extrabold mt-1">{Number(item.sale_price).toFixed(2).replace(/\.00$/, '')} د.ت</p>}
              </div>
            </div>
          </div>

          <label className="block text-sm font-semibold mb-1.5">عدد النسخ</label>
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={() => setCopies(Math.max(1, n - 1))} className="w-10 h-10 rounded-lg border border-[#e5e5e5] text-lg">−</button>
            <input type="number" min="1" max="60" inputMode="numeric" value={copies}
              onChange={(e) => setCopies(e.target.value)}
              className="w-20 text-center px-2 py-2.5 border border-[#e5e5e5] rounded-lg text-sm" />
            <button type="button" onClick={() => setCopies(Math.min(60, n + 1))} className="w-10 h-10 rounded-lg border border-[#e5e5e5] text-lg">+</button>
            {item.category === 'accessory' && stock > 1 && (
              <button type="button" onClick={() => setCopies(Math.min(60, stock))}
                className="text-xs font-semibold px-3 h-10 rounded-lg border border-[#e5e5e5] text-[#6b6b6b]">= المخزون ({stock})</button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm my-3">
            <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> إظهار السعر على الملصق
          </label>

          <div className="grid grid-cols-2 gap-1 bg-[#f3f1ea] rounded-xl p-1 mb-4">
            {[['roll', '🎞️ رول ملصقات'], ['sheet', '📄 ورقة A4']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setLayout(v)}
                className={`text-xs font-semibold py-2 rounded-lg ${layout === v ? 'bg-white text-[#e4211b] shadow-sm' : 'text-[#6b6b6b]'}`}>{l}</button>
            ))}
          </div>

          <button onClick={() => window.print()}
            className="w-full bg-[#e4211b] text-white font-semibold text-sm py-3 rounded-lg">🖨 طباعة {n} ملصق</button>
        </div>
      </div>

      {createPortal(
        <div id="label-root" dir="rtl">
          <style>{`
            #label-root { display: none; }
            @media print {
              #root, .no-print { display: none !important; }
              #label-root { display: block !important; color: #000; font-family: system-ui, Tahoma, Arial, sans-serif;
                            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              ${layout === 'roll'
                ? '@page { size: 50mm 30mm; margin: 0; } .label { page-break-after: always; break-after: page; }'
                : '@page { size: A4; margin: 8mm; } #label-root { display: flex !important; flex-wrap: wrap; gap: 2mm; align-content: flex-start; } .label { outline: .2mm dashed #999; }'}
              .label { width: 50mm; height: 30mm; box-sizing: border-box; display: flex; align-items: center; gap: 1.5mm; padding: 1.5mm; overflow: hidden; }
              .label .t { min-width: 0; text-align: right; line-height: 1.2; }
              .label .nm { font-size: 8pt; font-weight: 800; max-height: 3.6em; overflow: hidden; }
              .label .cl { font-size: 7pt; }
              .label .im { font-size: 6pt; direction: ltr; text-align: right; }
              .label .pr { font-size: 11pt; font-weight: 800; margin-top: .8mm; }
              .label .sh { font-size: 5.5pt; margin-top: .5mm; }
            }
          `}</style>
          {Array.from({ length: n }, (_, i) => <Label key={i} item={item} showPrice={showPrice} />)}
        </div>,
        document.body
      )}
    </>
  )
}
