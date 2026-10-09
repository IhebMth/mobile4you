import { useState } from 'react'
import { createPortal } from 'react-dom'
import QrCode from './QrCode'
import logo from '../../assets/logo.png'
import { SHOP, trackUrl, scanUrl } from '../../lib/shopConfig'

// order = { order_number, access_token, device_model, issue_description,
//           price_min, price_max, created_at, client_name }
// Two printouts:
//   receipt — 72mm thermal-style paper for the CLIENT. Shows the comptoir's ESTIMATED price and tells the
//             client the final price (confirmed by the technician) appears on the page the QR opens.
//   sticker — small label for the DEVICE; QR opens the order inside the app (staff scan it).
export default function PrintOrderDialog({ order, onClose }) {
  const [mode, setMode] = useState('receipt')

  function print(m) {
    setMode(m)
    setTimeout(() => window.print(), 80) // let the right layout reach the DOM first
  }

  const date = new Date(order.created_at || Date.now()).toLocaleString('fr-TN')
  const hasEstimate = order.price_min != null && order.price_min !== ''
  const estimate = hasEstimate
    ? order.price_max != null && order.price_max !== '' && Number(order.price_max) !== Number(order.price_min)
      ? `${order.price_min} - ${order.price_max}`
      : `${order.price_min}`
    : null

  return (
    <>
      {/* ---------- on-screen dialog ---------- */}
      {/* No tap-outside-to-close on purpose (08/10/2026): it closed by accident on phones.
          Close only with the "متابعة بلا طباعة" button. */}
      <div className="no-print fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 shadow-xl text-center">
          <img src={logo} alt="" className="w-12 h-12 rounded-xl object-cover mx-auto mb-2" />
          <h3 className="font-extrabold text-base mb-1">تم تسجيل الطلب ✅</h3>
          <p className="text-sm text-[#6b6b6b] mb-4" dir="ltr">{order.order_number}</p>

          <div className="flex justify-center mb-3 border border-[#e5e5e5] rounded-xl py-4">
            <QrCode value={trackUrl(order.access_token)} size={150} />
          </div>
          <p className="text-xs text-[#6b6b6b] mb-4">الحريف يمسح الكود باش يتابع جهازو ويلقى السعر النهائي بعد تأكيد التقني</p>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button onClick={() => print('receipt')}
              className="bg-[#e4211b] text-white font-semibold text-sm py-3 rounded-lg">🧾 وصل الحريف</button>
            <button onClick={() => print('sticker')}
              className="bg-[#1a1a1a] text-white font-semibold text-sm py-3 rounded-lg">🏷️ ملصق الجهاز</button>
          </div>
          <button onClick={onClose}
            className="w-full border border-[#e5e5e5] text-sm py-3 rounded-lg text-[#6b6b6b]">متابعة بلا طباعة</button>
        </div>
      </div>

      {/* ---------- print-only area (portal to <body>; #root is hidden while printing) ---------- */}
      {createPortal(
        <div id="print-root" data-mode={mode} dir="rtl">
          <style>{`
            #print-root { display: none; }
            @media print {
              #root, .no-print { display: none !important; }
              #print-root { display: block !important; color: #000; font-family: system-ui, Tahoma, Arial, sans-serif;
                            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              #print-root[data-mode="receipt"] .sticker { display: none; }
              #print-root[data-mode="sticker"] .receipt { display: none; }
              @page { margin: 0; }

              .receipt { width: 72mm; margin: 0 auto; padding: 5mm 3mm 6mm; box-sizing: border-box; text-align: center; }
              .receipt .logo { width: 17mm; height: 17mm; object-fit: cover; border-radius: 3mm; filter: grayscale(1) contrast(1.35); }
              .receipt h1 { font-size: 15pt; letter-spacing: .5px; margin: 1.5mm 0 0; }
              .receipt .sub { font-size: 8.5pt; margin-top: .5mm; }
              .receipt .title { margin: 3mm 0; padding: 1.4mm 0; border-top: .4mm solid #000; border-bottom: .4mm solid #000;
                                font-size: 11pt; font-weight: 800; letter-spacing: .3px; }
              .receipt .order { border: .4mm solid #000; border-radius: 2.5mm; padding: 2mm; margin-bottom: 3mm; }
              .receipt .order .lbl { font-size: 8pt; }
              .receipt .order .num { font-size: 14pt; font-weight: 800; direction: ltr; letter-spacing: .5px; }
              .receipt .order .dt { font-size: 8.5pt; direction: ltr; }
              .receipt .info { width: 100%; border-collapse: collapse; text-align: right; font-size: 10pt; }
              .receipt .info td { padding: 1.3mm 0; border-bottom: .2mm dashed #777; vertical-align: top; }
              .receipt .info td:first-child { width: 22%; font-weight: 800; font-size: 9pt; white-space: nowrap; }
              .receipt .est { margin-top: 3mm; border: .4mm dashed #000; border-radius: 2.5mm; padding: 2mm; }
              .receipt .est .lbl { font-size: 8.5pt; font-weight: 800; }
              .receipt .est .val { font-size: 14pt; font-weight: 800; }
              .receipt .est .val span { direction: ltr; display: inline-block; }
              .receipt .est .note { font-size: 8pt; margin-top: 1mm; line-height: 1.35; }
              .receipt .qrbox { margin-top: 3.5mm; }
              .receipt .qrbox .cap { font-size: 9pt; font-weight: 700; margin-top: 1.5mm; line-height: 1.35; }
              .receipt .foot { margin-top: 3.5mm; padding-top: 2mm; border-top: .2mm dashed #777; font-size: 8pt; line-height: 1.4; }

              .sticker { width: 50mm; height: 30mm; display: flex; align-items: center; gap: 2mm; padding: 1.5mm; box-sizing: border-box; overflow: hidden; }
              .sticker .t { font-size: 9pt; line-height: 1.25; text-align: right; min-width: 0; }
              .sticker .n { font-size: 10pt; font-weight: 800; direction: ltr; }
              .sticker .s { font-size: 7pt; font-weight: 700; margin-top: 1mm; }
            }
          `}</style>

          <div className="receipt">
            <img className="logo" src={logo} alt="" />
            <h1>{SHOP.name}</h1>
            {(SHOP.phone || SHOP.address) && (
              <div className="sub">{[SHOP.phone && <span key="p" dir="ltr">{SHOP.phone}</span>, SHOP.address].filter(Boolean).reduce((a, b) => [a, ' · ', b])}</div>
            )}

            <div className="title">وصل استلام جهاز</div>

            <div className="order">
              <div className="lbl">رقم الطلب</div>
              <div className="num">{order.order_number}</div>
              <div className="dt">{date}</div>
            </div>

            <table className="info">
              <tbody>
                {order.client_name && <tr><td>الحريف</td><td>{order.client_name}</td></tr>}
                <tr><td>الجهاز</td><td>{order.device_model}</td></tr>
                {order.issue_description && <tr><td>العطل</td><td>{order.issue_description}</td></tr>}
              </tbody>
            </table>

            {estimate && (
              <div className="est">
                <div className="lbl">السعر التقديري</div>
                <div className="val"><span>{estimate}</span> د.ت</div>
                <div className="note">هذا سعر تقديري من المحل. السعر النهائي يؤكّدو التقني، وتلقاه في صفحة المتابعة بعد مسح الكود.</div>
              </div>
            )}

            <div className="qrbox">
              <QrCode value={trackUrl(order.access_token)} size={135} />
              <div className="cap">امسح الكود لمتابعة جهازك<br />ومعرفة السعر النهائي</div>
            </div>

            <div className="foot">يرجى الاحتفاظ بهذا الوصل عند استلام الجهاز<br />شكراً لثقتكم 🙏</div>
          </div>

          <div className="sticker">
            <QrCode value={scanUrl(order.order_number)} size={86} />
            <div className="t">
              <div className="n">{order.order_number}</div>
              <div>{order.device_model}</div>
              <div className="s">{SHOP.name}</div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
